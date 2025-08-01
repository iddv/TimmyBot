import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export interface GitHubActionsStackProps extends cdk.StackProps {
  projectName: string;
  environment: string;
  githubRepository: string; // e.g., "iddv/TimmyBot"
}

/**
 * 🔒 CDK Stack for GitHub Actions OIDC Authentication
 * 
 * Creates the necessary AWS resources for secure GitHub Actions deployment:
 * - OIDC Identity Provider for GitHub
 * - IAM Role that GitHub Actions can assume
 * - Granular permissions for ECR, ECS, Secrets Manager, CloudWatch
 * 
 * This eliminates the need for storing AWS access keys in GitHub Secrets!
 */
export class GitHubActionsStack extends cdk.Stack {
  public readonly githubActionsRole: iam.Role;
  public readonly githubActionsRoleArn: string;

  constructor(scope: Construct, id: string, props: GitHubActionsStackProps) {
    super(scope, id, props);

    // =============================================================================
    // 1. GitHub OIDC Identity Provider
    // =============================================================================
    
    const githubOidcProvider = new iam.OpenIdConnectProvider(this, 'GitHubOidcProvider', {
      url: 'https://token.actions.githubusercontent.com',
      clientIds: ['sts.amazonaws.com'],
      thumbprints: [
        // GitHub's OIDC thumbprint (verified by AWS)
        '6938fd4d98bab03faadb97b34396831e3780aea1'
      ],
    });

    // =============================================================================
    // 2. IAM Policy for GitHub Actions
    // =============================================================================
    
    const githubActionsPolicyDocument = new iam.PolicyDocument({
      statements: [
        // ECR Permissions - Push/Pull Docker images
        new iam.PolicyStatement({
          sid: 'ECRPermissions',
          effect: iam.Effect.ALLOW,
          actions: [
            'ecr:GetAuthorizationToken',
            'ecr:BatchCheckLayerAvailability',
            'ecr:GetDownloadUrlForLayer',
            'ecr:BatchGetImage',
            'ecr:InitiateLayerUpload',
            'ecr:UploadLayerPart',
            'ecr:CompleteLayerUpload',
            'ecr:PutImage'
          ],
          resources: ['*'], // ECR GetAuthorizationToken requires '*'
        }),
        
        // ECS Permissions - Deploy to Fargate
        new iam.PolicyStatement({
          sid: 'ECSPermissions',
          effect: iam.Effect.ALLOW,
          actions: [
            'ecs:DescribeTaskDefinition',
            'ecs:RegisterTaskDefinition',
            'ecs:UpdateService',
            'ecs:DescribeServices',
            'ecs:ListTasks',
            'ecs:DescribeTasks'
          ],
          resources: [
            // Allow access to TimmyBot ECS resources
            `arn:aws:ecs:${this.region}:${this.account}:cluster/${props.projectName}-${props.environment}-cluster`,
            `arn:aws:ecs:${this.region}:${this.account}:service/${props.projectName}-${props.environment}-cluster/${props.projectName}-${props.environment}-service`,
            `arn:aws:ecs:${this.region}:${this.account}:task-definition/${props.projectName}-${props.environment}-task:*`,
          ],
        }),
        
        // IAM PassRole - Required for ECS task execution
        new iam.PolicyStatement({
          sid: 'PassRolePermissions',
          effect: iam.Effect.ALLOW,
          actions: ['iam:PassRole'],
          resources: [
            `arn:aws:iam::${this.account}:role/${props.projectName}-${props.environment}-*`
          ],
          conditions: {
            StringEquals: {
              'iam:PassedToService': 'ecs-tasks.amazonaws.com'
            }
          }
        }),
        
        // Secrets Manager - Read bot tokens and configuration
        new iam.PolicyStatement({
          sid: 'SecretsManagerPermissions',
          effect: iam.Effect.ALLOW,
          actions: [
            'secretsmanager:GetSecretValue',
            'secretsmanager:DescribeSecret'
          ],
          resources: [
            `arn:aws:secretsmanager:${this.region}:${this.account}:secret:${props.projectName}/${props.environment}/*`
          ],
        }),
        
        // CloudWatch Logs - Deployment monitoring
        new iam.PolicyStatement({
          sid: 'CloudWatchLogsPermissions',
          effect: iam.Effect.ALLOW,
          actions: [
            'logs:CreateLogGroup',
            'logs:DescribeLogStreams',
            'logs:GetLogEvents'
          ],
          resources: [
            `arn:aws:logs:${this.region}:${this.account}:log-group:/ecs/${props.projectName}-${props.environment}*`
          ],
        }),
      ],
    });

    // =============================================================================
    // 3. GitHub Actions IAM Role
    // =============================================================================
    
    this.githubActionsRole = new iam.Role(this, 'GitHubActionsRole', {
      roleName: `GitHubActions-${props.projectName}-${props.environment}-Role`,
      description: `GitHub Actions OIDC role for ${props.projectName} deployment to ${props.environment}`,
      
      // Trust policy - Allow GitHub Actions to assume this role
      assumedBy: new iam.WebIdentityPrincipal(githubOidcProvider.openIdConnectProviderArn, {
        StringEquals: {
          'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
        },
        StringLike: {
          // Only allow this specific repository to assume the role
          'token.actions.githubusercontent.com:sub': `repo:${props.githubRepository}:*`,
        },
      }),
      
      // Attach the permissions policy
      inlinePolicies: {
        GitHubActionsPolicy: githubActionsPolicyDocument,
      },
      
      // Session duration - GitHub Actions runs are typically short
      maxSessionDuration: cdk.Duration.hours(2),
    });

    this.githubActionsRoleArn = this.githubActionsRole.roleArn;

    // =============================================================================
    // 4. CloudFormation Outputs
    // =============================================================================
    
    new cdk.CfnOutput(this, 'GitHubOidcProviderArn', {
      value: githubOidcProvider.openIdConnectProviderArn,
      description: 'GitHub OIDC Identity Provider ARN',
      exportName: `${props.projectName}-${props.environment}-github-oidc-provider-arn`,
    });

    new cdk.CfnOutput(this, 'GitHubActionsRoleArn', {
      value: this.githubActionsRole.roleArn,
      description: '🔑 Add this Role ARN to GitHub Secrets as AWS_ROLE_ARN',
      exportName: `${props.projectName}-${props.environment}-github-actions-role-arn`,
    });

    new cdk.CfnOutput(this, 'GitHubSecretsSetupInstructions', {
      value: `https://github.com/${props.githubRepository}/settings/secrets/actions`,
      description: '📋 GitHub Secrets configuration URL',
    });

    // =============================================================================
    // 5. Stack Tags
    // =============================================================================
    
    cdk.Tags.of(this).add('Project', props.projectName);
    cdk.Tags.of(this).add('Environment', props.environment);
    cdk.Tags.of(this).add('Stack', 'GitHubActions');
    cdk.Tags.of(this).add('Purpose', 'CI/CD OIDC Authentication');
  }
}