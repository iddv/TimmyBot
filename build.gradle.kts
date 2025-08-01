import org.jetbrains.kotlin.gradle.tasks.KotlinCompile

plugins {
    java
    kotlin("jvm") version "1.6.21"  // Updated to resolve version conflicts
}

group = "com.novamaday.d4j.gradle"
version = "2021.08.31"

repositories {
    mavenCentral()
    maven("https://m2.dv8tion.net/releases")
}

dependencies {
    implementation(kotlin("stdlib"))
    
    // Core bot dependencies
    implementation("com.discord4j:discord4j-core:3.2.2")
    implementation("ch.qos.logback:logback-classic:1.2.3")
    implementation("com.sedmelluq:lavaplayer:1.3.75")
    implementation("io.github.microutils:kotlin-logging-jvm:2.0.11")
    
    // Kotlin Coroutines - Required for unified Command interface
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.6.4")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-reactor:1.6.4")
    
    // AWS SDK for DynamoDB and Secrets Manager
    implementation("software.amazon.awssdk:dynamodb:2.20.143")
    implementation("software.amazon.awssdk:secretsmanager:2.20.143")
    implementation("software.amazon.awssdk:sts:2.20.143")
    
    // JSON parsing for secrets
    implementation("com.fasterxml.jackson.core:jackson-databind:2.15.2")
    implementation("com.fasterxml.jackson.module:jackson-module-kotlin:2.15.2")
    
    // Testing dependencies
    testImplementation("org.junit.jupiter:junit-jupiter:5.8.2")
    testImplementation("org.mockito:mockito-core:4.6.1")
    testImplementation("org.mockito.kotlin:mockito-kotlin:4.0.0")
    testImplementation("org.assertj:assertj-core:3.23.1")
    testImplementation("io.mockk:mockk:1.13.2")
    testImplementation("io.projectreactor:reactor-test:3.4.25")
    testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.6.4")
    testImplementation(kotlin("test"))
}

tasks.test {
    useJUnitPlatform()
}

tasks.jar {
    manifest {
        attributes("Main-Class" to "timmybot.TimmyBot")
    }
    
    from(configurations.runtimeClasspath.get().map { if (it.isDirectory) it else zipTree(it) })
    duplicatesStrategy = DuplicatesStrategy.EXCLUDE
}

val compileKotlin: KotlinCompile by tasks
compileKotlin.kotlinOptions {
    jvmTarget = "16"
}
val compileTestKotlin: KotlinCompile by tasks
compileTestKotlin.kotlinOptions {
    jvmTarget = "16"
}