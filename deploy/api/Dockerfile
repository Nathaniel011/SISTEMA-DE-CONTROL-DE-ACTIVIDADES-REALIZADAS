FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /src
COPY backend/pom.xml ./
RUN mvn -B -q -DskipTests dependency:go-offline
COPY backend/src/ ./src/
RUN mvn -B -q package \
 && mvn -B -q dependency:copy \
    -Dartifact=io.opentelemetry.javaagent:opentelemetry-javaagent:2.34.0 \
    -DoutputDirectory=/agent -Dmdep.stripVersion=true

FROM eclipse-temurin:21-jre-jammy
WORKDIR /app
RUN groupadd --system scar && useradd --system --gid scar --no-create-home scar \
 && mkdir /uploads && chown scar:scar /uploads
COPY --from=build /src/target/scar-api-2.0.0.jar /app/scar.jar
COPY --from=build /agent/opentelemetry-javaagent.jar /app/opentelemetry-javaagent.jar
USER scar
ENTRYPOINT ["java", "-javaagent:/app/opentelemetry-javaagent.jar", "-jar", "/app/scar.jar"]
