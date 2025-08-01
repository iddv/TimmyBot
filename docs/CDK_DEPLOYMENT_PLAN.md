# 🚀 TimmyBot CDK Infrastructure Plan (For Approval)

**Status**: 📋 **PLAN REVIEW** - Awaiting Approval  
**Phase**: Phase 1 - Foundation & Infrastructure  
**Target**: AWS ECS Fargate with Guild-Isolated Architecture using AWS CDK

---

## 📋 **Revised Architecture Plan**

### **Why AWS CDK?**
- ✅ **AWS-Native**: Full AWS service integration and faster feature adoption
- ✅ **TypeScript/Python**: Familiar programming languages instead of HCL
- ✅ **AWS Console Integration**: Better debugging and monitoring experience  
- ✅ **Team Comfort**: Eliminates unfamiliarity with Terraform
- ✅ **Zero Cost**: Same $0 tooling cost as Terraform, only pay for AWS resources

### **CDK vs Previous Terraform Approach**

| Aspect | Previous (Terraform) | **New (CDK)** |
|--------|---------------------|---------------|
| **Language** | HCL (HashiCorp) | TypeScript/Python (AWS-native) |
| **State Management** | S3 + DynamoDB | CloudFormation (built-in) |
| **AWS Integration** | Third-party provider | First-party AWS service |
| **Team Familiarity** | Learning curve | AWS-native familiarity |
| **Deployment** | `terraform apply` | `cdk deploy` |
| **Cost** | $0 + AWS resources | $0 + AWS resources |

---

## 🏗️ **CDK Infrastructure Components**

### **1. Networking Stack** (`NetworkingStack`)
```typescript
// VPC with public/private subnets across 2 AZs
// NAT Gateways for secure outbound access
// Security groups for ECS tasks
```

### **2. ECS Stack** (`EcsStack`)
```typescript
// ECS Fargate cluster with Container Insights
// Task definition with guild-isolated architecture
// ECS service with auto-scaling 0-5 instances
// IAM roles for task execution and runtime
```

### **3. Database Stack** (`DatabaseStack`)
```typescript
// DynamoDB tables (pay-per-request):
// - guild-queues (FIXES shared queue bug!)
// - user-preferences (OAuth references)
// - track-cache (performance optimization)
// - server-allowlist (cost control)
```

### **4. Security Stack** (`SecurityStack`)
```typescript
// AWS Secrets Manager:
// - Discord bot token
// - OAuth client credentials  
// - Database configuration
// - Application settings
```

### **5. Monitoring Stack** (`MonitoringStack`)
```typescript
// CloudWatch log groups
// CloudWatch alarms for ECS health
// Basic dashboards for monitoring
```

---

## 📦 **CDK Project Structure**

```
cdk/
├── bin/
│   └── timmybot.ts              # CDK app entry point
├── lib/
│   ├── networking-stack.ts      # VPC, subnets, security groups
│   ├── ecs-stack.ts            # ECS cluster, tasks, services
│   ├── database-stack.ts       # DynamoDB tables
│   ├── security-stack.ts       # Secrets Manager
│   └── monitoring-stack.ts     # CloudWatch, alarms
├── test/
│   └── *.test.ts               # Unit tests for stacks
├── cdk.json                    # CDK configuration
├── package.json                # Node.js dependencies
└── tsconfig.json               # TypeScript configuration
```

---

## 🔧 **Development Workflow**

### **Phase 1 Implementation Steps:**
1. **✅ APPROVED PLAN** (this document)
2. **🛠️ CDK Project Setup**
   - Initialize CDK project with TypeScript
   - Configure AWS profile and region
   - Set up project dependencies

3. **🏗️ Infrastructure Development**
   - Networking stack (VPC, subnets, security)
   - Database stack (DynamoDB tables with guild isolation)
   - ECS stack (cluster, task definition, service)
   - Security stack (Secrets Manager)
   - Monitoring stack (CloudWatch integration)

4. **🧪 Testing & Validation**
   - CDK synth (generate CloudFormation)
   - Review generated templates
   - Deploy to development environment

5. **📚 Documentation Update**
   - Update deployment guide
   - Update TRACKER.md with progress

---

## 💰 **Cost Analysis (Same as Terraform)**

| Resource | Monthly Cost | Notes |
|----------|-------------|-------|
| **ECS Fargate** (0.25 vCPU, 512MB) | ~$8-12 | 24/7 operation |
| **DynamoDB** (Pay-per-request) | ~$1-3 | Low traffic during dev |
| **NAT Gateway** | ~$32 | Required for private subnets |
| **Secrets Manager** | ~$2 | 4 secrets |
| **CloudWatch Logs** | ~$1 | Log retention |
| **Total** | **~$44-50/month** | Within target range |

**Cost Optimizations Available:**
- Single NAT Gateway for development (save ~$32/month)
- ECS auto-scaling to 0 when inactive
- 7-day log retention for development

---

## 🚀 **Deployment Commands**

```bash
# One-time setup
npm install -g aws-cdk
cdk bootstrap

# Development workflow  
cdk diff                    # Preview changes
cdk deploy --all           # Deploy all stacks
cdk destroy --all          # Clean up (development only)
```

---

## 🔍 **Key Advantages of CDK Approach**

### **1. AWS-Native Integration**
- **CloudFormation backend** - No separate state management needed
- **AWS Console integration** - View stacks, resources, events directly
- **IAM integration** - Native AWS permissions model

### **2. Developer Experience** 
- **TypeScript IDE support** - IntelliSense, type checking, refactoring
- **Familiar syntax** - Standard programming language, not DSL
- **Unit testing** - Test infrastructure code like application code

### **3. AWS Feature Adoption**
- **Day-1 support** - New AWS services available immediately
- **Best practices** - AWS-recommended patterns built-in
- **Documentation** - Comprehensive AWS docs and examples

### **4. Guild Isolation Fix**
- **DynamoDB design** - Per-guild queues with proper keys
- **Performance** - Query by guild_id, no cross-contamination
- **Scalability** - Each guild independent, no shared state

---

## ❓ **Questions for Approval**

1. **Language Choice**: TypeScript (recommended) or Python for CDK?
2. **Region**: `eu-central-1` (Frankfurt) or different preference?
3. **Environment**: Start with `dev` environment, add `prod` later?
4. **Cost Optimization**: Single NAT Gateway for development to save costs?
5. **Monitoring**: Basic CloudWatch or more comprehensive observability?

---

## ✅ **Approval Checklist**

- [ ] **Architecture approved** - ECS Fargate + DynamoDB + Secrets Manager
- [ ] **CDK approach approved** - AWS-native tooling preferred
- [ ] **Cost estimation acceptable** - ~$44-50/month for development
- [ ] **Implementation approach approved** - Incremental stack-by-stack development
- [ ] **Guild isolation solution approved** - DynamoDB per-guild queues

---

## 🎯 **Next Steps After Approval**

1. Initialize CDK project with chosen language
2. Implement infrastructure stacks incrementally
3. Test and validate each component
4. Update documentation and TRACKER.md
5. Proceed to Discord Gateway implementation

**Ready to proceed? Please approve this plan and we'll begin CDK implementation immediately!** 🚀