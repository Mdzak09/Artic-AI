package com.zaamtech.polarion.aiassistant.config;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.Properties;
import java.util.logging.Level;
import java.util.logging.Logger;

import com.polarion.alm.shared.api.transaction.ReadOnlyTransaction;
import com.polarion.alm.shared.api.transaction.TransactionalExecutor;
import com.polarion.platform.core.PlatformContext;
import com.polarion.platform.service.repository.IRepositoryConnection;
import com.polarion.platform.service.repository.IRepositoryReadOnlyConnection;
import com.polarion.platform.service.repository.IRepositoryService;
import com.polarion.subterra.base.location.ILocation;
import com.polarion.subterra.base.location.Location;
import com.zaamtech.polarion.aiassistant.security.PolarionSecurity;

/** Stores the single global Arctic AI settings document in Polarion's default repository. */
public final class SettingsStore {
    private static final Logger LOG = Logger.getLogger(SettingsStore.class.getName());
    private static final String SETTINGS_DIRECTORY = ".polarion/extensions/com.zaamtech.polarion.aiassistant";
    private static final String SETTINGS_FILE = "settings.properties";

    private SettingsStore() { }

    public static AssistantSettings load() {
        try {
            Properties properties = PolarionSecurity.asCurrentUser(SettingsStore::readProperties);
            return AssistantSettings.fromProperties(properties);
        } catch (Exception e) {
            LOG.log(Level.SEVERE, "Unable to read Arctic AI settings from the Polarion repository", e);
            throw new IllegalStateException("Arctic AI repository settings could not be read.", e);
        }
    }

    public static void save(AssistantSettings settings) {
        try {
            PolarionSecurity.asCurrentUser(() -> {
                writeProperties(settings.toProperties());
                return null;
            });
        } catch (Exception e) {
            LOG.log(Level.SEVERE, "Unable to save Arctic AI settings to the Polarion repository", e);
            throw new IllegalStateException("Arctic AI repository settings could not be saved.", e);
        }
    }

    private static Properties readProperties() {
        ILocation file = settingsFile();
        return TransactionalExecutor.executeSafelyInReadOnlyTransaction(transaction -> {
            IRepositoryReadOnlyConnection connection = repositoryService().getReadOnlyConnection(file);
            Properties properties = new Properties();
            if (!connection.exists(file)) {
                return properties;
            }
            try (InputStream input = connection.getContent(file)) {
                properties.load(input);
                return properties;
            } catch (IOException e) {
                throw new IllegalStateException("Could not read the repository settings document.", e);
            }
        });
    }

    private static void writeProperties(Properties properties) {
        ILocation folder = repositoryRoot().append(SETTINGS_DIRECTORY);
        ILocation file = folder.append(SETTINGS_FILE);
        Runnable write = () -> {
            IRepositoryConnection connection = repositoryService().getConnection(folder);
            connection.makeFolders(folder);
            byte[] bytes = serialize(properties);
            try (InputStream input = new ByteArrayInputStream(bytes)) {
                if (connection.exists(file)) {
                    connection.setContent(file, input);
                } else {
                    connection.create(file, input);
                }
            } catch (IOException e) {
                throw new IllegalStateException("Could not write the repository settings document.", e);
            }
        };

        ReadOnlyTransaction current = TransactionalExecutor.currentTransaction();
        if (current == null) {
            TransactionalExecutor.executeInWriteTransaction(transaction -> {
                write.run();
                return null;
            });
        } else if (current.isReadOnly()) {
            throw new IllegalStateException("Arctic AI settings cannot be saved inside a read-only Polarion transaction.");
        } else {
            write.run();
        }
    }

    private static byte[] serialize(Properties properties) {
        try (ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            properties.store(output, "Arctic AI global settings");
            return output.toByteArray();
        } catch (IOException e) {
            throw new IllegalStateException("Could not encode Arctic AI settings.", e);
        }
    }

    private static ILocation settingsFile() {
        return repositoryRoot().append(SETTINGS_DIRECTORY).append(SETTINGS_FILE);
    }

    private static ILocation repositoryRoot() {
        return Location.getLocationWithRepository(IRepositoryService.DEFAULT, "/");
    }

    private static IRepositoryService repositoryService() {
        IRepositoryService service = (IRepositoryService)
                PlatformContext.getPlatform().lookupService(IRepositoryService.class);
        if (service == null) {
            throw new IllegalStateException("Polarion repository service is unavailable.");
        }
        return service;
    }
}
