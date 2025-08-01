#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { NetworkingStack } from '../lib/networking-stack';
import { DatabaseStack } from '../lib/database-stack';
import { SecurityStack } from '../lib/security-stack';
import { EcsStack } from '../lib/ecs-stack';
import { MonitoringStack } from '../lib/monitoring-stack';
import { GitHubActionsStack } from '../lib/github-actions-stack';

const app = new cdk.App();

// Configuration
const projectName = app.node.tryGetContext('projectName') || 'timmybot';
const environment = app.node.tryGetContext('environment') || 'dev';
const region = app.node.tryGetContext('region') || 'eu-central-1';
const githubRepository = app.node.tryGetContext('githubRepository') || 'iddv/TimmyBot';

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: region,
};

const stackProps = {
  projectName,
  environment,
  env,
};

// 1. Networking Stack - VPC, Subnets, Security Groups
const networkingStack = new NetworkingStack(app, `${projectName}-${environment}-networking`, stackProps);

// 2. Database Stack - DynamoDB Tables
const databaseStack = new DatabaseStack(app, `${projectName}-${environment}-database`, stackProps);

// 3. Security Stack - Secrets Manager
const securityStack = new SecurityStack(app, `${projectName}-${environment}-security`, stackProps);

// 4. ECS Stack - Cluster, Service, Task Definition
const ecsStack = new EcsStack(app, `${projectName}-${environment}-ecs`, {
  ...stackProps,
  vpc: networkingStack.vpc,
  securityGroup: networkingStack.ecsSecurityGroup,
  guildQueuesTable: databaseStack.guildQueuesTable,
  userPreferencesTable: databaseStack.userPreferencesTable,
  trackCacheTable: databaseStack.trackCacheTable,
  serverAllowlistTable: databaseStack.serverAllowlistTable,
  discordBotTokenSecret: securityStack.discordBotTokenSecret,
  databaseConfigSecret: securityStack.databaseConfigSecret,
  appConfigSecret: securityStack.appConfigSecret,
});

// 5. Monitoring Stack - CloudWatch, Alarms, Dashboard
const monitoringStack = new MonitoringStack(app, `${projectName}-${environment}-monitoring`, {
  ...stackProps,
  cluster: ecsStack.cluster,
  service: ecsStack.service,
});

// 6. GitHub Actions Stack - OIDC Authentication for CI/CD
const githubActionsStack = new GitHubActionsStack(app, `${projectName}-${environment}-github-actions`, {
  ...stackProps,
  githubRepository,
});

// Dependencies
ecsStack.addDependency(networkingStack);
ecsStack.addDependency(databaseStack);
ecsStack.addDependency(securityStack);
monitoringStack.addDependency(ecsStack);
// GitHub Actions stack is independent - can be deployed standalone

// Tags for all stacks
cdk.Tags.of(app).add('Project', projectName);
cdk.Tags.of(app).add('Environment', environment);
cdk.Tags.of(app).add('ManagedBy', 'AWS-CDK');