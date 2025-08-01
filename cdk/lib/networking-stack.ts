import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';

export interface NetworkingStackProps extends cdk.StackProps {
  projectName: string;
  environment: string;
}

export class NetworkingStack extends cdk.Stack {
  public readonly vpc: ec2.Vpc;
  public readonly ecsSecurityGroup: ec2.SecurityGroup;

  constructor(scope: Construct, id: string, props: NetworkingStackProps) {
    super(scope, id, props);

    // VPC with public and private subnets across 2 AZs
    this.vpc = new ec2.Vpc(this, 'TimmyBotVpc', {
      ipAddresses: ec2.IpAddresses.cidr('10.0.0.0/16'),
      maxAzs: 2,
      natGateways: 2, // One per AZ for high availability
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC,
        },
        {
          cidrMask: 24,
          name: 'Private',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
        },
      ],
      enableDnsHostnames: true,
      enableDnsSupport: true,
    });

    // Security Group for ECS Tasks
    this.ecsSecurityGroup = new ec2.SecurityGroup(this, 'EcsTasksSecurityGroup', {
      vpc: this.vpc,
      description: 'Security group for TimmyBot ECS tasks',
      allowAllOutbound: true, // Required for Discord API and music services
    });

    // Tags
    cdk.Tags.of(this.vpc).add('Name', `${props.projectName}-${props.environment}-vpc`);
    cdk.Tags.of(this.ecsSecurityGroup).add('Name', `${props.projectName}-${props.environment}-ecs-sg`);

    // Outputs
    new cdk.CfnOutput(this, 'VpcId', {
      value: this.vpc.vpcId,
      description: 'VPC ID',
      exportName: `${props.projectName}-${props.environment}-vpc-id`,
    });

    new cdk.CfnOutput(this, 'EcsSecurityGroupId', {
      value: this.ecsSecurityGroup.securityGroupId,
      description: 'ECS Security Group ID',
      exportName: `${props.projectName}-${props.environment}-ecs-sg-id`,
    });
  }
}