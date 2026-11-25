package com.scar.api.config;

import org.springframework.context.ApplicationContextInitializer;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.core.env.Environment;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * Creates the SCAR database and user on first startup when admin credentials are available.
 */
public class PostgresAutoProvisioner implements ApplicationContextInitializer<ConfigurableApplicationContext> {

    private static final Logger log = Logger.getLogger(PostgresAutoProvisioner.class.getName());

    @Override
    public void initialize(ConfigurableApplicationContext context) {
        Environment env = context.getEnvironment();
        if (!env.getProperty("scar.db.auto-provision", Boolean.class, true)) {
            return;
        }
        provision(env);
    }

    static void provision(Environment env) {
        String host = env.getProperty("DB_HOST", "localhost");
        String port = env.getProperty("DB_PORT", "5432");
        String dbName = env.getProperty("DB_NAME", "scar");
        String dbUser = env.getProperty("DB_USER", "scar");
        String dbPassword = env.getRequiredProperty("DB_PASSWORD");

        String appUrl = jdbcUrl(host, port, dbName);
        if (canConnect(appUrl, dbUser, dbPassword)) {
            log.info("PostgreSQL database '" + dbName + "' is ready.");
            return;
        }

        String adminUser = env.getProperty("DB_ADMIN_USER", "postgres");
        String adminPassword = env.getProperty("DB_ADMIN_PASSWORD", "");
        if (adminPassword.isBlank()) {
            throw new IllegalStateException(
                "Database '" + dbName + "' is not available. "
                    + "Copy dev/local.env.example to dev/local.env, set DB_ADMIN_PASSWORD to your local "
                    + "postgres password, then restart the backend. "
                    + "Alternatively run: psql -U postgres -f scripts/init-local-db.sql"
            );
        }

        String adminUrl = jdbcUrl(host, port, "postgres");
        try (Connection admin = DriverManager.getConnection(adminUrl, adminUser, adminPassword)) {
            admin.setAutoCommit(true);
            createRoleIfMissing(admin, dbUser, dbPassword);
            createDatabaseIfMissing(admin, dbName, dbUser);
        } catch (SQLException e) {
            throw new IllegalStateException(
                "Could not auto-provision PostgreSQL. Check DB_ADMIN_USER/DB_ADMIN_PASSWORD in dev/local.env "
                    + "or run scripts/init-local-db.sql once.",
                e
            );
        }

        if (!canConnect(appUrl, dbUser, dbPassword)) {
            throw new IllegalStateException("Database '" + dbName + "' was created but is still unreachable.");
        }

        log.info("PostgreSQL database '" + dbName + "' created successfully.");
    }

    private static boolean canConnect(String url, String user, String password) {
        try (Connection ignored = DriverManager.getConnection(url, user, password)) {
            return true;
        } catch (SQLException e) {
            return false;
        }
    }

    private static void createRoleIfMissing(Connection admin, String role, String password) throws SQLException {
        if (roleExists(admin, role)) {
            return;
        }
        try (Statement stmt = admin.createStatement()) {
            stmt.execute("CREATE ROLE " + quoteIdent(role) + " WITH LOGIN PASSWORD " + quoteLiteral(password));
        }
    }

    private static void createDatabaseIfMissing(Connection admin, String dbName, String owner) throws SQLException {
        if (databaseExists(admin, dbName)) {
            return;
        }
        try (Statement stmt = admin.createStatement()) {
            stmt.execute("CREATE DATABASE " + quoteIdent(dbName) + " OWNER " + quoteIdent(owner));
        }
    }

    private static boolean roleExists(Connection conn, String role) throws SQLException {
        try (var ps = conn.prepareStatement("SELECT 1 FROM pg_roles WHERE rolname = ?")) {
            ps.setString(1, role);
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next();
            }
        }
    }

    private static boolean databaseExists(Connection conn, String dbName) throws SQLException {
        try (var ps = conn.prepareStatement("SELECT 1 FROM pg_database WHERE datname = ?")) {
            ps.setString(1, dbName);
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next();
            }
        }
    }

    private static String jdbcUrl(String host, String port, String database) {
        return "jdbc:postgresql://" + host + ":" + port + "/" + database;
    }

    private static String quoteIdent(String value) {
        if (!value.matches("[a-zA-Z_][a-zA-Z0-9_]*")) {
            throw new IllegalArgumentException("Invalid SQL identifier: " + value);
        }
        return value;
    }

    private static String quoteLiteral(String value) {
        return "'" + value.replace("'", "''") + "'";
    }
}
