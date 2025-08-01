import org.jetbrains.kotlin.gradle.tasks.KotlinCompile

plugins {
    java
    kotlin("jvm") version "2.1.0"  // Compatible with Gradle 8.5 and modern Kord libraries
}

group = "com.novamaday.d4j.gradle"
version = "2021.08.31"

repositories {
    mavenCentral()
    maven("https://m2.dv8tion.net/releases")
    maven("https://maven.arbjerg.dev/snapshots") // Required for Lavalink.kt
}

dependencies {
    implementation(kotlin("stdlib"))
    
    // Kord Discord API - Kotlin-native, coroutine-based
    implementation("dev.kord:kord-core:0.15.0")
    implementation("dev.kord:kord-voice:0.15.0") // For voice channel support
    
    // Lavalink.kt for music functionality (requires maven.arbjerg.dev/snapshots)
    implementation("dev.schlaubi.lavakord:kord:9.1.0")
    
    // Logging - Updated for Kotlin 2.1.0 compatibility
    implementation("ch.qos.logback:logback-classic:1.4.14")
    implementation("io.github.microutils:kotlin-logging-jvm:3.0.5")
    
    // Kotlin Coroutines - Compatible with Kotlin 2.1.0
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.9.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-jdk8:1.9.0")
    
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
    testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.9.0")
    testImplementation(kotlin("test"))
}

tasks.test {
    useJUnitPlatform()
}

tasks.jar {
    manifest {
        attributes("Main-Class" to "timmybot.KordTimmyBotKt")  // Updated for Kord implementation
    }
    
    from(configurations.runtimeClasspath.get().map { if (it.isDirectory) it else zipTree(it) })
    duplicatesStrategy = DuplicatesStrategy.EXCLUDE
}

val compileKotlin: KotlinCompile by tasks
compileKotlin.kotlinOptions {
    jvmTarget = "17"  // Kord requires Java 17+
}
val compileTestKotlin: KotlinCompile by tasks
compileTestKotlin.kotlinOptions {
    jvmTarget = "17"
}