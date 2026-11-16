(() => {
    'use strict';

    const api = '/polarion/aiassistant/api/admin';
    const csrfToken = document.querySelector('meta[name="csrf-token"]').content;
    const notice = document.getElementById('notice');
    const content = document.getElementById('settings-content');
    const roleOptions = document.getElementById('role-options');
    let currentSettings = null;

    function showNotice(message, isError = false, isWarning = false) {
        notice.textContent = message;
        notice.classList.toggle('error', isError);
        notice.classList.toggle('warning', isWarning);
        notice.hidden = false;
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function hideNotice() {
        notice.hidden = true;
        notice.textContent = '';
        notice.classList.remove('warning');
    }

    async function request(path, options = {}) {
        const response = await fetch(api + path, {
            credentials: 'same-origin',
            cache: 'no-store',
            ...options
        });
        const contentType = response.headers.get('content-type') || '';
        const body = await response.text();
        if (!contentType.toLowerCase().includes('application/json')) {
            const error = new Error('The settings endpoint returned a non-JSON response (HTTP ' + response.status + '). Check Polarion authentication and servlet routing.');
            error.httpStatus = response.status;
            throw error;
        }
        let result;
        try {
            result = JSON.parse(body);
        } catch (error) {
            const parseError = new Error('The settings endpoint returned invalid JSON (HTTP ' + response.status + ').');
            parseError.httpStatus = response.status;
            throw parseError;
        }
        if (!result || typeof result !== 'object' || Array.isArray(result)) {
            const schemaError = new Error('The settings endpoint returned an unexpected response (HTTP ' + response.status + ').');
            schemaError.httpStatus = response.status;
            throw schemaError;
        }
        if (!response.ok) {
            const requestError = new Error(result.error || result.message || 'The request could not be completed.');
            requestError.httpStatus = response.status;
            throw requestError;
        }
        return result;
    }

    function readForm() {
        const form = new URLSearchParams();
        form.set('enabled', String(document.getElementById('enabled').checked));
        form.set('showHeaderButton', String(document.getElementById('showHeaderButton').checked));
        form.set('name', document.getElementById('name').value);
        form.set('accessMode', document.getElementById('accessMode').value);

        roleOptions.querySelectorAll('input[name="accessRoles"]:checked').forEach((input) => {
            form.append('accessRoles', input.value);
        });

        form.set('theme', document.getElementById('theme').value);
        form.set('accentColor', document.getElementById('accentColor').value.toUpperCase());
        form.set('sidebarWidth', document.getElementById('sidebarWidth').value);
        form.set('headerPlacement', document.getElementById('headerPlacement').value);
        form.set('mockMode', String(document.getElementById('mockMode').checked));
        form.set('endpoint', document.getElementById('endpoint').value);
        form.set('model', document.getElementById('model').value);
        form.set('timeoutSeconds', document.getElementById('timeoutSeconds').value);
        return form;
    }

    function renderRoles(roles, selected, available, unavailableMessage) {
        roleOptions.replaceChildren();
        if (!available) {
            const warning = document.createElement('p');
            warning.className = 'empty-roles';
            warning.textContent = unavailableMessage;
            roleOptions.append(warning);
            selected.forEach((role) => {
                const label = document.createElement('label');
                const checkbox = document.createElement('input');
                const text = document.createElement('span');
                label.className = 'role-choice';
                checkbox.type = 'checkbox';
                checkbox.name = 'accessRoles';
                checkbox.value = role;
                checkbox.checked = true;
                checkbox.disabled = true;
                text.textContent = role + ' (saved; unavailable)';
                label.append(checkbox, text);
                roleOptions.append(label);
            });
            return;
        }
        if (!roles.length) {
            const empty = document.createElement('p');
            empty.className = 'empty-roles';
            empty.textContent = 'No Polarion global roles were returned by the security service.';
            roleOptions.append(empty);
            return;
        }

        roles.forEach((role) => {
            const label = document.createElement('label');
            const checkbox = document.createElement('input');
            const text = document.createElement('span');

            label.className = 'role-choice';
            checkbox.type = 'checkbox';
            checkbox.name = 'accessRoles';
            checkbox.value = role;
            checkbox.checked = selected.includes(role);
            text.textContent = role;
            label.append(checkbox, text);
            roleOptions.append(label);
        });
    }

    function render(settings) {
        currentSettings = settings;
        document.getElementById('enabled').checked = settings.enabled;
        document.getElementById('showHeaderButton').checked = settings.showHeaderButton !== false;
        document.getElementById('name').value = settings.name;
        document.getElementById('accessMode').value = settings.accessMode;
        document.getElementById('theme').value = settings.theme;
        document.getElementById('accentColor').value = settings.accentColor.toLowerCase();
        document.getElementById('sidebarWidth').value = settings.sidebarWidth;
        document.getElementById('headerPlacement').value = settings.headerPlacement;
        document.getElementById('mockMode').checked = settings.mockMode;
        document.getElementById('endpoint').value = settings.endpoint;
        document.getElementById('model').value = settings.model;
        document.getElementById('timeoutSeconds').value = settings.timeoutSeconds;

        const rolesAvailable = settings.globalRolesAvailable !== false;
        renderRoles(settings.globalRoles, settings.accessRoles, rolesAvailable,
            settings.globalRolesError || 'Polarion global roles are unavailable.');
        document.getElementById('accessMode').disabled = !rolesAvailable;
        document.getElementById('diagnostic-servlet').textContent = 'Available (authenticated HTTP 200 JSON)';
        document.getElementById('diagnostic-storage').textContent = 'Read succeeded; write unverified';
        document.getElementById('diagnostic-roles').textContent = rolesAvailable
            ? 'Available (' + settings.globalRoles.length + ' roles)'
            : 'Unavailable';
        document.getElementById('key-status').textContent = settings.apiKeyConfigured
            ? 'Configured in server environment'
            : 'Not configured';
        document.getElementById('diagnostic-key').textContent = settings.apiKeyConfigured
            ? 'Configured (value hidden)'
            : 'Not configured';
        document.getElementById('diagnostic-enabled').textContent = settings.enabled
            ? 'Enabled'
            : 'Disabled';
        document.getElementById('diagnostic-mode').textContent = settings.mockMode
            ? 'Development mock'
            : (settings.endpoint && settings.model ? 'Real provider configured' : 'Real provider incomplete');
        document.getElementById('diagnostic-provider').textContent = 'Not tested';

        document.getElementById('diagnostic-header').textContent =
            'Before SIEMENS branding when the Navigation Header is available';
        const warning = document.getElementById('header-warning');
        warning.hidden = false;
        warning.textContent = 'Placement uses Polarion internal header markup through scriptInjection.mainHead; the button stays hidden until the native SIEMENS branding is available.';

        updateAccessVisibility();
        updateProviderVisibility();
        updateAppearancePreview();
    }

    function updateAccessVisibility() {
        document.getElementById('role-picker').hidden =
            document.getElementById('accessMode').value !== 'roles';
    }

    function updateProviderVisibility() {
        document.getElementById('provider-fields').classList.toggle(
            'provider-mock',
            document.getElementById('mockMode').checked
        );
    }

    function updateAppearancePreview() {
        const name = document.getElementById('name').value.trim() || 'AI';
        const color = document.getElementById('accentColor').value.toUpperCase();
        const width = document.getElementById('sidebarWidth').value;
        document.getElementById('accent-value').value = color;
        document.getElementById('width-value').value = width + ' px';
        document.getElementById('preview-name').textContent = name;
        document.getElementById('preview-card').style.setProperty('--preview-accent', color);
    }

    async function loadSettings() {
        content.setAttribute('aria-busy', 'true');
        try {
            const settings = await request('/settings');
            render(settings);
            if (settings.globalRolesAvailable === false) {
                showNotice(settings.globalRolesError, false, true);
            }
            content.setAttribute('aria-busy', 'false');
        } catch (error) {
            content.setAttribute('aria-busy', 'false');
            document.getElementById('diagnostic-servlet').textContent = error.httpStatus
                ? 'Responded HTTP ' + error.httpStatus
                : 'Request failed';
            document.getElementById('diagnostic-storage').textContent = error.httpStatus === 503
                ? 'Read failed (HTTP 503)'
                : 'Not verified';
            document.getElementById('diagnostic-roles').textContent = 'Not checked';
            showNotice(error.message, true);
        }
    }

    function savedSettingsMatch(settings, form) {
        const expectedRoles = form.getAll('accessRoles').slice().sort();
        const actualRoles = (settings.accessRoles || []).slice().sort();
        return settings.enabled === (form.get('enabled') === 'true')
            && settings.showHeaderButton === (form.get('showHeaderButton') === 'true')
            && settings.name === form.get('name').trim()
            && settings.accessMode === form.get('accessMode')
            && JSON.stringify(actualRoles) === JSON.stringify(expectedRoles)
            && settings.theme === form.get('theme')
            && settings.accentColor.toUpperCase() === form.get('accentColor').toUpperCase()
            && settings.sidebarWidth === Number(form.get('sidebarWidth'))
            && settings.headerPlacement === form.get('headerPlacement')
            && settings.mockMode === (form.get('mockMode') === 'true')
            && settings.endpoint === form.get('endpoint')
            && settings.model === form.get('model')
            && settings.timeoutSeconds === Number(form.get('timeoutSeconds'));
    }

    async function saveSettings() {
        hideNotice();
        const saveButton = document.getElementById('save');
        saveButton.disabled = true;
        try {
            const form = readForm();
            const result = await request('/settings', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
                    'X-CSRF-Token': csrfToken
                },
                body: form
            });
            const saved = await request('/settings');
            if (!savedSettingsMatch(saved, form)) {
                throw new Error('Polarion accepted the save, but the settings read-back did not match the submitted values.');
            }
            render(saved);
            document.getElementById('diagnostic-storage').textContent = 'Repository read/write verified';
            showNotice(result.message || 'Settings saved and reloaded from Polarion.');
        } catch (error) {
            showNotice(error.message, true);
        } finally {
            saveButton.disabled = false;
        }
    }

    async function restoreDefaults() {
        hideNotice();
        if (!window.confirm('Restore Arctic AI defaults? This changes the live configuration.')) {
            return;
        }
        try {
            const result = await request('/restore', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
                    'X-CSRF-Token': csrfToken
                },
                body: new URLSearchParams()
            });
            const saved = await request('/settings');
            render(saved);
            showNotice(result.message || 'Defaults restored.');
        } catch (error) {
            showNotice(error.message, true);
        }
    }

    async function testConnection() {
        const status = document.getElementById('connection-status');
        const button = document.getElementById('test-connection');
        status.textContent = 'Testingâ€¦';
        button.disabled = true;
        try {
            const result = await request('/test', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
                    'X-CSRF-Token': csrfToken
                },
                body: readForm()
            });
            status.textContent = result.message;
            status.className = 'success-text';
            document.getElementById('diagnostic-provider').textContent = 'Connected: ' + result.message;
        } catch (error) {
            status.textContent = error.message;
            status.className = 'error-text';
            document.getElementById('diagnostic-provider').textContent = 'Failed: ' + error.message;
        } finally {
            button.disabled = false;
        }
    }

    function selectSection(name) {
        document.querySelectorAll('.nav-item').forEach((button) => {
            const selected = button.dataset.section === name;
            button.classList.toggle('active', selected);
            button.setAttribute('aria-current', selected ? 'page' : 'false');
        });
        document.querySelectorAll('.settings-section').forEach((section) => {
            const selected = section.dataset.panel === name;
            section.classList.toggle('active', selected);
            section.hidden = !selected;
        });
    }

    document.querySelectorAll('.nav-item').forEach((button) => {
        button.addEventListener('click', () => selectSection(button.dataset.section));
    });
    document.getElementById('accessMode').addEventListener('change', updateAccessVisibility);
    document.getElementById('mockMode').addEventListener('change', updateProviderVisibility);
    document.getElementById('accentColor').addEventListener('input', updateAppearancePreview);
    document.getElementById('sidebarWidth').addEventListener('input', updateAppearancePreview);
    document.getElementById('name').addEventListener('input', updateAppearancePreview);
    document.getElementById('save').addEventListener('click', saveSettings);
    document.getElementById('cancel').addEventListener('click', loadSettings);
    document.getElementById('restore-defaults').addEventListener('click', restoreDefaults);
    document.getElementById('test-connection').addEventListener('click', testConnection);

    loadSettings();
})();
