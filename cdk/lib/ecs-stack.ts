import * as cdk from 'aws-cdk-lib';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
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
        // Lavalink Configuration
        _JAVA_OPTIONS: '-Xmx768m',  // JVM heap: 768MB (leaving room for container overhead)
        SERVER_PORT: '2333',
        SERVER_ADDRESS: '0.0.0.0',
        // Audio processing optimizations
        LAVALINK_SERVER_BUFFER_DURATION_MS: '400',
        LAVALINK_SERVER_FRAME_BUFFER_DURATION_MS: '5000',
        LAVALINK_SERVER_OPUS_ENCODING_QUALITY: '4',  // Balanced quality/CPU
        LAVALINK_SERVER_RESAMPLING_QUALITY: 'LOW',   // Lower CPU usage
        // Enable sources - UPDATED: Disable deprecated YouTube source, use plugin instead
        LAVALINK_SERVER_SOURCES_YOUTUBE: 'false',  // DISABLED: deprecated source
        LAVALINK_SERVER_SOURCES_SOUNDCLOUD: 'true',
        LAVALINK_SERVER_SOURCES_BANDCAMP: 'true',
        LAVALINK_SERVER_SOURCES_TWITCH: 'true',
        LAVALINK_SERVER_SOURCES_HTTP: 'true',
        LAVALINK_SERVER_SOURCES_LOCAL: 'false',
        // Generated password for sidecar communication (network isolated)  
        LAVALINK_SERVER_PASSWORD: props.appConfigSecret.secretValueFromJson('lavalink_password').unsafeUnwrap(),
        // YouTube Source Plugin - NEW: Replaces deprecated built-in YouTube source
        LAVALINK_PLUGINS_0_DEPENDENCY: 'dev.lavalink.youtube:youtube-plugin:1.7.2',
        LAVALINK_PLUGINS_0_REPOSITORY: 'https://maven.lavalink.dev/releases',
        // Logging
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
        // Health check: Lavalink REST API endpoint with authorization
        command: ['CMD-SHELL', 'curl -f -H "Authorization: $LAVALINK_SERVER_PASSWORD" http://localhost:2333/version || exit 1'],
        interval: cdk.Duration.seconds(15),
        timeout: cdk.Duration.seconds(5),
        retries: 3,
        startPeriod: cdk.Duration.seconds(30),
      },
      essential: true,  // If Lavalink crashes, restart the whole task
    });

    // Container Definition - Guild Isolation Architecture
    const container = this.taskDefinition.addContainer('TimmyBotContainer', {
      containerName: `${props.projectName}-${props.environment}-container`,
      // Guild Isolation Architecture - ECR Image
      image: ecs.ContainerImage.fromRegistry('164859598862.dkr.ecr.eu-central-1.amazonaws.com/timmybot:guild-isolation-latest'),
      memoryReservationMiB: 1024, // 1GB for TimmyBot
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: 'timmybot',
        logGroup: logGroup,
      }),
      environment: {
        // AWS Configuration for Guild Isolation Architecture
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
        // Force deployment update
        DEPLOYMENT_VERSION: new Date().toISOString(),
      },
      // No secrets needed - AwsSecretsService handles all secret retrieval
      healthCheck: {
        // Health check matches Docker container: check if Java process is running
        command: ['CMD-SHELL', 'pgrep -f "java.*timmybot.jar" > /dev/null || exit 1'],
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(10),
        retries: 3,
        startPeriod: cdk.Duration.seconds(90),  // Increased: wait for Lavalink to be ready
      },  
      essential: true,  // If TimmyBot crashes, restart the whole task
    });

    // Container Dependencies - TimmyBot waits for Lavalink to be healthy  
    container.addContainerDependencies({
      container: lavalinkContainer,
      condition: ecs.ContainerDependencyCondition.HEALTHY,
    });

    // No port mappings needed - Discord bot uses WebSocket connections

    // ECS Service
    this.service = new ecs.FargateService(this, 'TimmyBotService', {
      serviceName: `${props.projectName}-${props.environment}-service`,
      cluster: this.cluster,
      taskDefinition: this.taskDefinition,
      desiredCount: 0, // Start with 0 - will scale up after deployment
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
    });

    // Auto Scaling
    const scaling = this.service.autoScaleTaskCount({
      minCapacity: 0,
      maxCapacity: 5,
    });

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
  }
}