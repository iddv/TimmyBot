import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

export interface DatabaseStackProps extends cdk.StackProps {
  projectName: string;
  environment: string;
}

export class DatabaseStack extends cdk.Stack {
  public readonly guildQueuesTable: dynamodb.Table;
  public readonly userPreferencesTable: dynamodb.Table;
  public readonly trackCacheTable: dynamodb.Table;
  public readonly serverAllowlistTable: dynamodb.Table;

  constructor(scope: Construct, id: string, props: DatabaseStackProps) {
    super(scope, id, props);

    // Guild Queues Table - FIXES SHARED QUEUE BUG!
    this.guildQueuesTable = new dynamodb.Table(this, 'GuildQueuesTable', {
      tableName: `${props.projectName}-${props.environment}-guild-queues`,
      partitionKey: { name: 'guild_id', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'queue_position', type: dynamodb.AttributeType.NUMBER },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      pointInTimeRecovery: true,
      removalPolicy: props.environment === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    // User Preferences Table
    this.userPreferencesTable = new dynamodb.Table(this, 'UserPreferencesTable', {
      tableName: `${props.projectName}-${props.environment}-user-prefs`,
      partitionKey: { name: 'user_id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      pointInTimeRecovery: true,
      timeToLiveAttribute: 'expires_at',
      removalPolicy: props.environment === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    // Track Cache Table
    this.trackCacheTable = new dynamodb.Table(this, 'TrackCacheTable', {
      tableName: `${props.projectName}-${props.environment}-track-cache`,
      partitionKey: { name: 'track_url_hash', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      pointInTimeRecovery: true,
      timeToLiveAttribute: 'expires_at',
      removalPolicy: props.environment === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    // Server Allowlist Table - for cost control
    this.serverAllowlistTable = new dynamodb.Table(this, 'ServerAllowlistTable', {
      tableName: `${props.projectName}-${props.environment}-server-allowlist`,
      partitionKey: { name: 'guild_id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      pointInTimeRecovery: true,
      removalPolicy: props.environment === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    // Tags
    const tables = [this.guildQueuesTable, this.userPreferencesTable, this.trackCacheTable, this.serverAllowlistTable];
    tables.forEach(table => {
      cdk.Tags.of(table).add('Project', props.projectName);
      cdk.Tags.of(table).add('Environment', props.environment);
    });

    // Outputs
    new cdk.CfnOutput(this, 'GuildQueuesTableName', {
      value: this.guildQueuesTable.tableName,
      description: 'Guild Queues DynamoDB Table Name',
      exportName: `${props.projectName}-${props.environment}-guild-queues-table`,
    });

    new cdk.CfnOutput(this, 'UserPreferencesTableName', {
      value: this.userPreferencesTable.tableName,
      description: 'User Preferences DynamoDB Table Name',
      exportName: `${props.projectName}-${props.environment}-user-prefs-table`,
    });

    new cdk.CfnOutput(this, 'TrackCacheTableName', {
      value: this.trackCacheTable.tableName,
      description: 'Track Cache DynamoDB Table Name',
      exportName: `${props.projectName}-${props.environment}-track-cache-table`,
    });

    new cdk.CfnOutput(this, 'ServerAllowlistTableName', {
      value: this.serverAllowlistTable.tableName,
      description: 'Server Allowlist DynamoDB Table Name',
      exportName: `${props.projectName}-${props.environment}-server-allowlist-table`,
    });
  }
}