import * as cdk from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as cloudwatchactions from 'aws-cdk-lib/aws-cloudwatch-actions';
import { Construct } from 'constructs';

export interface MonitoringStackProps extends cdk.StackProps {
  projectName: string;
  environment: string;
  cluster: ecs.Cluster;
  service: ecs.FargateService;
}

export class MonitoringStack extends cdk.Stack {
  public readonly dashboard: cloudwatch.Dashboard;
  public readonly alertTopic: sns.Topic;

  constructor(scope: Construct, id: string, props: MonitoringStackProps) {
    super(scope, id, props);

    // SNS Topic for Alerts
    this.alertTopic = new sns.Topic(this, 'AlertTopic', {
      topicName: `${props.projectName}-${props.environment}-alerts`,
      displayName: `TimmyBot ${props.environment} Alerts`,
    });

    // CloudWatch Alarms

    // High CPU Utilization Alarm
    const cpuAlarm = new cloudwatch.Alarm(this, 'HighCpuAlarm', {
      alarmName: `${props.projectName}-${props.environment}-high-cpu`,
      alarmDescription: 'High CPU utilization on ECS service',
      metric: props.service.metricCpuUtilization(),
      threshold: 80,
      evaluationPeriods: 2,
      datapointsToAlarm: 2,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    cpuAlarm.addAlarmAction(new cloudwatchactions.SnsAction(this.alertTopic));

    // High Memory Utilization Alarm
    const memoryAlarm = new cloudwatch.Alarm(this, 'HighMemoryAlarm', {
      alarmName: `${props.projectName}-${props.environment}-high-memory`,
      alarmDescription: 'High memory utilization on ECS service',
      metric: props.service.metricMemoryUtilization(),
      threshold: 85,
      evaluationPeriods: 2,
      datapointsToAlarm: 2,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    memoryAlarm.addAlarmAction(new cloudwatchactions.SnsAction(this.alertTopic));

    // Service Task Count Alarm (should have at least 1 running task)
    const taskCountMetric = new cloudwatch.Metric({
      namespace: 'AWS/ECS',
      metricName: 'RunningTaskCount',
      dimensionsMap: {
        ServiceName: props.service.serviceName,
        ClusterName: props.cluster.clusterName,
      },
      statistic: 'Average',
    });

    const taskCountAlarm = new cloudwatch.Alarm(this, 'NoRunningTasksAlarm', {
      alarmName: `${props.projectName}-${props.environment}-no-running-tasks`,
      alarmDescription: 'No running tasks in ECS service',
      metric: taskCountMetric,
      threshold: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
      evaluationPeriods: 2,
      datapointsToAlarm: 2,
      treatMissingData: cloudwatch.TreatMissingData.BREACHING,
    });
    taskCountAlarm.addAlarmAction(new cloudwatchactions.SnsAction(this.alertTopic));

    // CloudWatch Dashboard
    this.dashboard = new cloudwatch.Dashboard(this, 'TimmyBotDashboard', {
      dashboardName: `${props.projectName}-${props.environment}-dashboard`,
    });

    // Add widgets to dashboard
    this.dashboard.addWidgets(
      // ECS Service Metrics
      new cloudwatch.GraphWidget({
        title: 'ECS Service - CPU & Memory Utilization',
        left: [props.service.metricCpuUtilization({ period: cdk.Duration.minutes(5) })],
        right: [props.service.metricMemoryUtilization({ period: cdk.Duration.minutes(5) })],
        width: 12,
        height: 6,
      }),

      // Task Count
      new cloudwatch.GraphWidget({
        title: 'ECS Service - Task Count',
        left: [
          new cloudwatch.Metric({
            namespace: 'AWS/ECS',
            metricName: 'RunningTaskCount',
            dimensionsMap: {
              ServiceName: props.service.serviceName,
              ClusterName: props.cluster.clusterName,
            },
            period: cdk.Duration.minutes(5),
          }),
          new cloudwatch.Metric({
            namespace: 'AWS/ECS',
            metricName: 'DesiredCount',
            dimensionsMap: {
              ServiceName: props.service.serviceName,
              ClusterName: props.cluster.clusterName,
            },
            period: cdk.Duration.minutes(5),
          }),
        ],
        width: 12,
        height: 6,
      }),

      // Cluster Metrics
      new cloudwatch.GraphWidget({
        title: 'ECS Cluster - Active Services',
        left: [
          new cloudwatch.Metric({
            namespace: 'AWS/ECS',
            metricName: 'ActiveServicesCount',
            dimensionsMap: {
              ClusterName: props.cluster.clusterName,
            },
            period: cdk.Duration.minutes(5),
          }),
        ],
        width: 12,
        height: 6,
      })
    );

    // Tags
    cdk.Tags.of(this.dashboard).add('Project', props.projectName);
    cdk.Tags.of(this.dashboard).add('Environment', props.environment);
    cdk.Tags.of(this.alertTopic).add('Project', props.projectName);
    cdk.Tags.of(this.alertTopic).add('Environment', props.environment);

    // Outputs
    new cdk.CfnOutput(this, 'DashboardUrl', {
      value: `https://${this.region}.console.aws.amazon.com/cloudwatch/home?region=${this.region}#dashboards:name=${this.dashboard.dashboardName}`,
      description: 'CloudWatch Dashboard URL',
    });

    new cdk.CfnOutput(this, 'AlertTopicArn', {
      value: this.alertTopic.topicArn,
      description: 'SNS Topic ARN for Alerts',
      exportName: `${props.projectName}-${props.environment}-alert-topic-arn`,
    });
  }
}