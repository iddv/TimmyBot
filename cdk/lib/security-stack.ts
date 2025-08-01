import * as cdk from 'aws-cdk-lib';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';

export interface SecurityStackProps extends cdk.StackProps {
  projectName: string;
  environment: string;
}

export class SecurityStack extends cdk.Stack {
  public readonly discordBotTokenSecret: secretsmanager.Secret;
  public readonly oauthClientsSecret: secretsmanager.Secret;
  public readonly databaseConfigSecret: secretsmanager.Secret;
  public readonly appConfigSecret: secretsmanager.Secret;

  constructor(scope: Construct, id: string, props: SecurityStackProps) {
    super(scope, id, props);

    // Discord Bot Token Secret
    this.discordBotTokenSecret = new secretsmanager.Secret(this, 'DiscordBotTokenSecret', {
      secretName: `${props.projectName}/${props.environment}/discord-bot-token`,
      description: 'Discord bot token for TimmyBot',
      generateSecretString: {
        excludeCharacters: ' %+~`#$&*()|[]{}:;<>?!\'/@"\\',
        secretStringTemplate: '{"token":"PLACEHOLDER_SET_MANUALLY"}',
        generateStringKey: 'token',
      },
      removalPolicy: props.environment === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    // OAuth Client Secrets for Music Services
    this.oauthClientsSecret = new secretsmanager.Secret(this, 'OAuthClientsSecret', {
      secretName: `${props.projectName}/${props.environment}/oauth-clients`,
      description: 'OAuth client secrets for music streaming services',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({
          youtube: {
            client_id: 'PLACEHOLDER_SET_MANUALLY',
            client_secret: 'PLACEHOLDER_SET_MANUALLY'
          },
          spotify: {
            client_id: 'PLACEHOLDER_SET_MANUALLY',
            client_secret: 'PLACEHOLDER_SET_MANUALLY'
          },
          soundcloud: {
            client_id: 'PLACEHOLDER_SET_MANUALLY',
            client_secret: 'PLACEHOLDER_SET_MANUALLY'
          },
          apple_music: {
            client_id: 'PLACEHOLDER_SET_MANUALLY',
            client_secret: 'PLACEHOLDER_SET_MANUALLY'
          }
        }),
        generateStringKey: 'temp',
      },
      removalPolicy: props.environment === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    // Database Configuration Secret
    this.databaseConfigSecret = new secretsmanager.Secret(this, 'DatabaseConfigSecret', {
      secretName: `${props.projectName}/${props.environment}/database-config`,
      description: 'Database connection configuration',
      secretObjectValue: {
        dynamodb_region: cdk.SecretValue.unsafePlainText(this.region),
        guild_queues_table: cdk.SecretValue.unsafePlainText(`${props.projectName}-${props.environment}-guild-queues`),
        user_preferences_table: cdk.SecretValue.unsafePlainText(`${props.projectName}-${props.environment}-user-prefs`),
        track_cache_table: cdk.SecretValue.unsafePlainText(`${props.projectName}-${props.environment}-track-cache`),
        server_allowlist_table: cdk.SecretValue.unsafePlainText(`${props.projectName}-${props.environment}-server-allowlist`),
      },
      removalPolicy: props.environment === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    // Application Configuration Secret
    this.appConfigSecret = new secretsmanager.Secret(this, 'AppConfigSecret', {
      secretName: `${props.projectName}/${props.environment}/app-config`,
      description: 'Application configuration settings',
      secretObjectValue: {
        environment: cdk.SecretValue.unsafePlainText(props.environment),
        log_level: cdk.SecretValue.unsafePlainText(props.environment === 'prod' ? 'INFO' : 'DEBUG'),
        server_allowlist_enabled: cdk.SecretValue.unsafePlainText('true'),
        oauth_required: cdk.SecretValue.unsafePlainText('true'),
        premium_features: cdk.SecretValue.unsafePlainText('true'),
      },
      removalPolicy: props.environment === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    // Tags
    const secrets = [this.discordBotTokenSecret, this.oauthClientsSecret, this.databaseConfigSecret, this.appConfigSecret];
    secrets.forEach(secret => {
      cdk.Tags.of(secret).add('Project', props.projectName);
      cdk.Tags.of(secret).add('Environment', props.environment);
    });

    // Outputs
    new cdk.CfnOutput(this, 'DiscordBotTokenSecretArn', {
      value: this.discordBotTokenSecret.secretArn,
      description: 'Discord Bot Token Secret ARN',
      exportName: `${props.projectName}-${props.environment}-discord-token-secret-arn`,
    });

    new cdk.CfnOutput(this, 'OAuthClientsSecretArn', {
      value: this.oauthClientsSecret.secretArn,
      description: 'OAuth Clients Secret ARN',
      exportName: `${props.projectName}-${props.environment}-oauth-clients-secret-arn`,
    });

    new cdk.CfnOutput(this, 'DatabaseConfigSecretArn', {
      value: this.databaseConfigSecret.secretArn,
      description: 'Database Config Secret ARN',
      exportName: `${props.projectName}-${props.environment}-db-config-secret-arn`,
    });
  }
}