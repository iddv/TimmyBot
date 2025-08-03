import * as cdk from 'aws-cdk-lib';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
// CloudWatch alarms and SNS topics are managed in the monitoring stack
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';

export interface EcsStackProps extends cdk.StackProps {
  projectName: string;
  environment: string;
  vpc: ec2.Vpc;
  securityGroup: ec2.SecurityGroup;
  guildQueuesTable: dynamodb.Table;
  userPreferencesTable: dynamodb.Table;
  trackCacheTable: dynamodb.Table;
  serverAllowlistTable: dynamodb.Table;
  discordBotTokenSecret: secretsmanager.Secret;
  databaseConfigSecret: secretsmanager.Secret;
  appConfigSecret: secretsmanager.Secret;
}

export class EcsStack extends cdk.Stack {
  public readonly cluster: ecs.Cluster;
  public readonly taskDefinition: ecs.FargateTaskDefinition;
  public readonly service: ecs.FargateService;

  constructor(scope: Construct, id: string, props: EcsStackProps) {
    super(scope, id, props);

    // ECS Cluster with Container Insights
    this.cluster = new ecs.Cluster(this, 'TimmyBotCluster', {
      clusterName: `${props.projectName}-${props.environment}-cluster`,
      vpc: props.vpc,
      containerInsights: true,
    });

    // CloudWatch Log Group
    const logGroup = new logs.LogGroup(this, 'TimmyBotLogGroup', {
      logGroupName: `/ecs/${props.projectName}-${props.environment}`,
      retention: props.environment === 'prod' ? logs.RetentionDays.ONE_MONTH : logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Task Execution Role
    const taskExecutionRole = new iam.Role(this, 'TaskExecutionRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonECSTaskExecutionRolePolicy'),
      ],
    });

    // Grant access to secrets for task execution (ECS agent needs this for container startup)
    props.discordBotTokenSecret.grantRead(taskExecutionRole);
    props.databaseConfigSecret.grantRead(taskExecutionRole);
    props.appConfigSecret.grantRead(taskExecutionRole);

    // Task Role for runtime permissions
    const taskRole = new iam.Role(this, 'TaskRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
    });

    // Grant DynamoDB permissions to task role
    const tables = [props.guildQueuesTable, props.userPreferencesTable, props.trackCacheTable, props.serverAllowlistTable];
    tables.forEach(table => {
      table.grantReadWriteData(taskRole);
    });

    // Grant runtime access to secrets for the application
    props.discordBotTokenSecret.grantRead(taskRole);
    props.databaseConfigSecret.grantRead(taskRole);
    props.appConfigSecret.grantRead(taskRole);

    // Use existing app-config secret that already contains lavalink_password
    // This matches the existing Lavalink container configuration

    // Fargate Task Definition - Updated for TimmyBot + Lavalink Sidecar
    this.taskDefinition = new ecs.FargateTaskDefinition(this, 'TaskDefinition', {
      family: `${props.projectName}-${props.environment}-task`,
      cpu: 1024,        // Increased: 1 vCPU for both containers
      memoryLimitMiB: 2048,  // Increased: 2GB total (TimmyBot: 1GB, Lavalink: 1GB)
      executionRole: taskExecutionRole,
      taskRole: taskRole,
    });

    // Lavalink Sidecar Container - Audio Processing for Music Bot
    const lavalinkContainer = this.taskDefinition.addContainer('LavalinkContainer', {
      containerName: `${props.projectName}-${props.environment}-lavalink`,
      image: ecs.ContainerImage.fromRegistry('ghcr.io/lavalink-devs/lavalink:4'),
      memoryReservationMiB: 1024, // 1GB for Lavalink
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: 'lavalink',
        logGroup: logGroup,
      }),
      environment: {
        // Lavalink Configuration - Using correct environment variable format
        _JAVA_OPTIONS: '-Xmx768m',  // JVM heap: 768MB (leaving room for container overhead)
        // Server configuration
        SERVER_PORT: '2333',
        SERVER_ADDRESS: '0.0.0.0',
        // Lavalink server configuration
        LAVALINK_SERVER_PASSWORD: props.appConfigSecret.secretValueFromJson('lavalink_password').unsafeUnwrap(),
        // YouTube Source Plugin - NEW: Official format from Lavalink docs
        LAVALINK_PLUGINS_0_DEPENDENCY: 'dev.lavalink.youtube:youtube-plugin:1.7.2',
        LAVALINK_PLUGINS_0_REPOSITORY: 'https://maven.lavalink.dev/releases',
        // Disable deprecated built-in sources and enable others
        LAVALINK_SERVER_SOURCES_YOUTUBE: 'false',  // DISABLED: deprecated, using plugin instead
        LAVALINK_SERVER_SOURCES_BANDCAMP: 'true',
        LAVALINK_SERVER_SOURCES_SOUNDCLOUD: 'true', 
        LAVALINK_SERVER_SOURCES_TWITCH: 'true',
        LAVALINK_SERVER_SOURCES_VIMEO: 'true',
        LAVALINK_SERVER_SOURCES_NICO: 'true',
        LAVALINK_SERVER_SOURCES_HTTP: 'true',
        LAVALINK_SERVER_SOURCES_LOCAL: 'false',
        // Audio optimization settings
        LAVALINK_SERVER_BUFFER_DURATION_MS: '400',
        LAVALINK_SERVER_FRAME_BUFFER_DURATION_MS: '5000',
        LAVALINK_SERVER_OPUS_ENCODING_QUALITY: '4',  // Balanced quality/CPU
        LAVALINK_SERVER_RESAMPLING_QUALITY: 'LOW',   // Lower CPU usage
        LAVALINK_SERVER_YOUTUBE_PLAYLIST_LOAD_LIMIT: '6',
        LAVALINK_SERVER_PLAYER_UPDATE_INTERVAL: '5',
        LAVALINK_SERVER_YOUTUBE_SEARCH_ENABLED: 'true',
        LAVALINK_SERVER_SOUNDCLOUD_SEARCH_ENABLED: 'true',
        // Logging configuration
        LOGGING_LEVEL_ROOT: 'INFO',
        LOGGING_LEVEL_LAVALINK: 'INFO',
      },
      portMappings: [
        {
          containerPort: 2333,
          protocol: ecs.Protocol.TCP,
        },
      ],
      healthCheck: {
        // Health check: Lavalink REST API endpoint with authorization (revert to working version)
        command: ['CMD-SHELL', 'curl -f -H "Authorization: $LAVALINK_SERVER_PASSWORD" http://localhost:2333/version || exit 1'],
        interval: cdk.Duration.seconds(30), // Keep original interval that was working
        timeout: cdk.Duration.seconds(10),  // Keep original timeout that was working
        retries: 3,  // Slightly more retries than original (was 2)
        startPeriod: cdk.Duration.seconds(60), // Keep original start period that was working
      },
      essential: false,  // Don't restart the whole task if Lavalink fails - let it stay failed
    });

    // Container Definition - Discord.js Migration
    const container = this.taskDefinition.addContainer('TimmyBotContainer', {
      containerName: `${props.projectName}-${props.environment}-container`,
      // Discord.js Implementation - ECR Image
      image: ecs.ContainerImage.fromRegistry('164859598862.dkr.ecr.eu-central-1.amazonaws.com/timmybot-discordjs:latest'),
      memoryReservationMiB: 1024, // 1GB for TimmyBot Discord.js
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: 'timmybot-discordjs',
        logGroup: logGroup,
      }),
      environment: {
        // Node.js Environment
        NODE_ENV: props.environment === 'prod' ? 'production' : 'development',
        // AWS Configuration for Discord.js Implementation
        AWS_DEFAULT_REGION: this.region,
        AWS_REGION: this.region,
        // DynamoDB Table Names (fallback values, secrets override these)
        GUILD_QUEUES_TABLE: `${props.projectName}-${props.environment}-guild-queues`,
        SERVER_ALLOWLIST_TABLE: `${props.projectName}-${props.environment}-server-allowlist`,
        USER_PREFERENCES_TABLE: `${props.projectName}-${props.environment}-user-prefs`,
        TRACK_CACHE_TABLE: `${props.projectName}-${props.environment}-track-cache`,
        // Secret Names (used by AwsSecretsService)
        DISCORD_BOT_TOKEN_SECRET: `${props.projectName}/${props.environment}/discord-bot-token`,
        DATABASE_CONFIG_SECRET: `${props.projectName}/${props.environment}/database-config`,
        APP_CONFIG_SECRET: `${props.projectName}/${props.environment}/app-config`,
        // Lavalink Sidecar Configuration - Localhost Connection
        LAVALINK_HOST: 'localhost',
        LAVALINK_PORT: '2333',
        LAVALINK_SECURE: 'false',  // HTTP connection (same container network)
        LAVALINK_PASSWORD: props.appConfigSecret.secretValueFromJson('lavalink_password').unsafeUnwrap(), // Same password as Lavalink container from app-config secret
        // Health Check Configuration
        HEALTH_CHECK_PORT: '3000',
        HEALTH_CHECK_HOST: '0.0.0.0',
        // Force deployment update
        DEPLOYMENT_VERSION: new Date().toISOString(),
      },
      // No secrets needed - AwsSecretsService handles all secret retrieval
      portMappings: [
        {
          containerPort: 3000,  // Health check endpoint
          protocol: ecs.Protocol.TCP,
        },
      ],
      healthCheck: {
        // Health check for Discord.js: HTTP endpoint
        command: ['CMD-SHELL', 'node dist/health-check-standalone.js || exit 1'],
        interval: cdk.Duration.seconds(180), // Much longer interval - 3 minutes
        timeout: cdk.Duration.seconds(30),   // Longer timeout for startup
        retries: 5,  // More retries before marking unhealthy
        startPeriod: cdk.Duration.seconds(300), // 5 minutes for full Discord bot initialization
      },  
      essential: true,  // Keep TimmyBot as essential but with reduced restart frequency
    });

    // Container Dependencies - TimmyBot waits for Lavalink to be healthy  
    container.addContainerDependencies({
      container: lavalinkContainer,
      condition: ecs.ContainerDependencyCondition.HEALTHY,
    });

    // No port mappings needed - Discord bot uses WebSocket connections

    // ECS Service with circuit breaker disabled to prevent restart loops
    this.service = new ecs.FargateService(this, 'TimmyBotService', {
      serviceName: `${props.projectName}-${props.environment}-service`,
      cluster: this.cluster,
      taskDefinition: this.taskDefinition,
      desiredCount: 1, // Set to 1 for normal operation
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      securityGroups: [props.securityGroup],
      assignPublicIp: false,
      capacityProviderStrategies: [
        {
          capacityProvider: 'FARGATE',
          weight: 1,
          base: 1,
        },
        {
          capacityProvider: 'FARGATE_SPOT',
          weight: 1,
        },
      ],
      enableExecuteCommand: true, // For debugging
      // Disable circuit breaker to prevent automatic rollbacks on failure
      circuitBreaker: {
        rollback: false,
      },
    });

    // Auto Scaling - keep minimum at 1 to prevent complete shutdown
    const scaling = this.service.autoScaleTaskCount({
      minCapacity: 1, // Keep at least 1 task running
      maxCapacity: 2, // Reduced max capacity for cost control
    });

    // Note: CloudWatch alarms and SNS topics are managed in the monitoring stack

    // Tags
    cdk.Tags.of(this.cluster).add('Project', props.projectName);
    cdk.Tags.of(this.cluster).add('Environment', props.environment);
    cdk.Tags.of(this.service).add('Project', props.projectName);
    cdk.Tags.of(this.service).add('Environment', props.environment);

    // Outputs
    new cdk.CfnOutput(this, 'ClusterName', {
      value: this.cluster.clusterName,
      description: 'ECS Cluster Name',
      exportName: `${props.projectName}-${props.environment}-cluster-name`,
    });

    new cdk.CfnOutput(this, 'ServiceName', {
      value: this.service.serviceName,
      description: 'ECS Service Name',
      exportName: `${props.projectName}-${props.environment}-service-name`,
    });

    new cdk.CfnOutput(this, 'TaskRoleArn', {
      value: taskRole.roleArn,
      description: 'ECS Task Role ARN',
      exportName: `${props.projectName}-${props.environment}-task-role-arn`,
    });

    // Note: Alert topic ARN is exported from the monitoring stack
  }
}