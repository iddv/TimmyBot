import org.jetbrains.kotlin.gradle.tasks.KotlinCompile

plugins {
    java

    //Gradle shadow plugin to make fatjar
    id("com.github.johnrengelman.shadow") version ("7.0.0")
    kotlin("jvm") version "1.6.20"
}

group = "com.novamaday.d4j.gradle"
version = "2021.08.31"

repositories {
    mavenCentral()
    maven("https://m2.dv8tion.net/releases")
}

sourceSets {
    all {
        dependencies {
            implementation("com.discord4j:discord4j-core:3.2.0")
            implementation("ch.qos.logback:logback-classic:1.2.3")
            implementation("com.discord4j:discord4j-core:3.2.2")
            implementation("com.sedmelluq:lavaplayer:1.3.75")

        }
    }
}

/*
Configure the sun.tools.jar.resources.jar task for our main class and so that `./gradlew build` always makes the fatjar
This boilerplate is completely removed when using Springboot
 */
tasks.jar {
    manifest {
        attributes("Main-Class" to "com.novamaday.d4j.gradle.simplebot.SimpleBot")
    }

    finalizedBy("shadowJar")
}
dependencies {
    implementation(kotlin("stdlib-jdk8"))
}
val compileKotlin: KotlinCompile by tasks
compileKotlin.kotlinOptions {
    jvmTarget = "1.8"
}
val compileTestKotlin: KotlinCompile by tasks
compileTestKotlin.kotlinOptions {
    jvmTarget = "1.8"
}