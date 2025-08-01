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

    // Grant access to secrets
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

    // Fargate Task Definition
    this.taskDefinition = new ecs.FargateTaskDefinition(this, 'TaskDefinition', {
      family: `${props.projectName}-${props.environment}-task`,
      cpu: 256,
      memoryLimitMiB: 512,
      executionRole: taskExecutionRole,
      taskRole: taskRole,
    });

    // Container Definition
    const container = this.taskDefinition.addContainer('TimmyBotContainer', {
      containerName: `${props.projectName}-${props.environment}-container`,
      image: ecs.ContainerImage.fromRegistry('openjdk:17-jre-slim'), // Placeholder - will be updated with actual image
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: 'ecs',
        logGroup: logGroup,
      }),
      environment: {
        AWS_REGION: this.region,
        PROJECT_NAME: props.projectName,
        ENVIRONMENT: props.environment,
      },
      secrets: {
        // Discord Bot Token
        DISCORD_BOT_TOKEN: ecs.Secret.fromSecretsManager(props.discordBotTokenSecret, 'token'),
        // Database Configuration
        DYNAMODB_REGION: ecs.Secret.fromSecretsManager(props.databaseConfigSecret, 'dynamodb_region'),
        GUILD_QUEUES_TABLE: ecs.Secret.fromSecretsManager(props.databaseConfigSecret, 'guild_queues_table'),
        USER_PREFERENCES_TABLE: ecs.Secret.fromSecretsManager(props.databaseConfigSecret, 'user_preferences_table'),
        TRACK_CACHE_TABLE: ecs.Secret.fromSecretsManager(props.databaseConfigSecret, 'track_cache_table'),
        SERVER_ALLOWLIST_TABLE: ecs.Secret.fromSecretsManager(props.databaseConfigSecret, 'server_allowlist_table'),
        // App Configuration
        LOG_LEVEL: ecs.Secret.fromSecretsManager(props.appConfigSecret, 'log_level'),
        SERVER_ALLOWLIST_ENABLED: ecs.Secret.fromSecretsManager(props.appConfigSecret, 'server_allowlist_enabled'),
      },
      healthCheck: {
        command: ['CMD-SHELL', 'echo "healthy" || exit 1'],
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(5),
        retries: 3,
        startPeriod: cdk.Duration.seconds(60),
      },
    });

    // Expose port 8080 for health checks (if needed)
    container.addPortMappings({
      containerPort: 8080,
      protocol: ecs.Protocol.TCP,
    });

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