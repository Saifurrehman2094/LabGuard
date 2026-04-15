import React, { useState, useEffect, useCallback } from 'react';
import './SnapshotConfig.css';

interface SnapshotConfigProps {
    onError?: (error: string) => void;
}

interface SnapshotSettings {
    enabled_violations: string[];
    cooldown_seconds: number;
    snapshots_enabled: boolean;
}

// Available violation types that can trigger snapshots
const AVAILABLE_VIOLATIONS = [
    {
        id: 'phone_violation',
        name: 'Phone Detection',
        description: 'Triggers when a phone/mobile device is detected in camera view',
        severity: 'high'
    },
    {
        id: 'multiple_persons',
        name: 'Multiple Faces',
        description: 'Triggers when more than one person is detected in camera view',
        severity: 'high'
    },
    {
        id: 'no_face_detected',
        name: 'No Face Detected',
        description: 'Triggers when the student\'s face is not visible to the camera',
        severity: 'medium'
    },
    {
        id: 'not_facing_screen',
        name: 'Not Facing Screen',
        description: 'Triggers when student\'s head is turned away from the screen',
        severity: 'medium'
    },
    {
        id: 'not_looking_at_screen',
        name: 'Not Looking at Screen',
        description: 'Triggers when student\'s eyes are not focused on the screen',
        severity: 'low'
    }
];

const SnapshotConfig: React.FC<SnapshotConfigProps> = ({ onError }) => {
    const [settings, setSettings] = useState<SnapshotSettings>({
        enabled_violations: ['phone_violation', 'multiple_persons'],
        cooldown_seconds: 7,
        snapshots_enabled: true
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [hasChanges, setHasChanges] = useState(false);
    const [saveSuccess, setSaveSuccess] = useState(false);

    // Load current snapshot configuration
    const loadConfig = useCallback(async () => {
        try {
            setLoading(true);
            const result = await window.electronAPI.getSnapshotConfig();
            
            if (result.success && result.config) {
                setSettings(result.config);
            } else if (result.error) {
                onError?.(result.error);
            }
        } catch (err) {
            console.error('Error loading snapshot config:', err);
            onError?.('Failed to load snapshot configuration');
        } finally {
            setLoading(false);
        }
    }, [onError]);

    // Save configuration
    const saveConfig = async () => {
        try {
            setSaving(true);
            setSaveSuccess(false);
            
            const result = await window.electronAPI.updateSnapshotConfig(settings);
            
            if (result.success) {
                setHasChanges(false);
                setSaveSuccess(true);
                setTimeout(() => setSaveSuccess(false), 3000);
            } else {
                onError?.(result.error || 'Failed to save configuration');
            }
        } catch (err) {
            console.error('Error saving snapshot config:', err);
            onError?.('Failed to save snapshot configuration');
        } finally {
            setSaving(false);
        }
    };

    // Toggle violation type
    const toggleViolation = (violationId: string) => {
        setSettings(prev => {
            const isEnabled = prev.enabled_violations.includes(violationId);
            const newViolations = isEnabled
                ? prev.enabled_violations.filter(v => v !== violationId)
                : [...prev.enabled_violations, violationId];
            
            return {
                ...prev,
                enabled_violations: newViolations
            };
        });
        setHasChanges(true);
    };

    // Update cooldown
    const updateCooldown = (value: number) => {
        setSettings(prev => ({
            ...prev,
            cooldown_seconds: Math.max(1, Math.min(60, value))
        }));
        setHasChanges(true);
    };

    // Toggle snapshots enabled
    const toggleSnapshotsEnabled = () => {
        setSettings(prev => ({
            ...prev,
            snapshots_enabled: !prev.snapshots_enabled
        }));
        setHasChanges(true);
    };

    // Load config on mount
    useEffect(() => {
        loadConfig();
    }, [loadConfig]);

    // Get severity badge class
    const getSeverityClass = (severity: string) => {
        switch (severity) {
            case 'high': return 'severity-high';
            case 'medium': return 'severity-medium';
            case 'low': return 'severity-low';
            default: return '';
        }
    };

    if (loading) {
        return (
            <div className="snapshot-config loading">
                <div className="loading-spinner"></div>
                <p>Loading snapshot configuration...</p>
            </div>
        );
    }

    return (
        <div className="snapshot-config">
            {/* Master Enable/Disable Toggle */}
            <div className="config-section master-toggle">
                <div className="toggle-row">
                    <div className="toggle-info">
                        <label>Enable Violation Snapshots</label>
                    </div>
                    <label className="switch">
                        <input
                            type="checkbox"
                            checked={settings.snapshots_enabled}
                            onChange={toggleSnapshotsEnabled}
                        />
                        <span className="slider"></span>
                    </label>
                </div>
            </div>

            {/* Cooldown Setting */}
            <div className={`config-section cooldown-section ${!settings.snapshots_enabled ? 'disabled' : ''}`}>
                <div className="cooldown-row">
                    <div className="cooldown-info">
                        <label>Snapshot Cooldown</label>
                        <small>
                            Minimum time (in seconds) between snapshots of the same violation type.
                            Prevents flooding the folder with duplicate images.
                        </small>
                    </div>
                    <div className="cooldown-input">
                        <button 
                            className="cooldown-btn"
                            onClick={() => updateCooldown(settings.cooldown_seconds - 1)}
                            disabled={!settings.snapshots_enabled || settings.cooldown_seconds <= 1}
                        >
                            -
                        </button>
                        <input
                            type="number"
                            value={settings.cooldown_seconds}
                            onChange={(e) => updateCooldown(parseInt(e.target.value) || 7)}
                            min={1}
                            max={60}
                            disabled={!settings.snapshots_enabled}
                        />
                        <button 
                            className="cooldown-btn"
                            onClick={() => updateCooldown(settings.cooldown_seconds + 1)}
                            disabled={!settings.snapshots_enabled || settings.cooldown_seconds >= 60}
                        >
                            +
                        </button>
                        <span className="cooldown-unit">seconds</span>
                    </div>
                </div>
            </div>

            {/* Violation Types */}
            <div className={`config-section violations-section ${!settings.snapshots_enabled ? 'disabled' : ''}`}>
                <h4>Select Violations to Capture</h4>
                <p className="section-description">
                    Choose which violation types should trigger automatic snapshots.
                    High severity violations are recommended for proof collection.
                </p>
                
                <div className="violations-grid" role="group" aria-label="Violation types for snapshots">
                    {AVAILABLE_VIOLATIONS.map(violation => {
                        const isEnabled = settings.enabled_violations.includes(violation.id);
                        const disabled = !settings.snapshots_enabled;
                        return (
                            <button
                                key={violation.id}
                                type="button"
                                className={`violation-card ${isEnabled ? 'enabled' : ''} ${disabled ? 'disabled' : ''}`}
                                onClick={() => !disabled && toggleViolation(violation.id)}
                                disabled={disabled}
                                aria-pressed={isEnabled}
                                aria-label={`${violation.name}. ${isEnabled ? 'On' : 'Off'}. ${violation.description}`}
                            >
                                <div className="violation-header">
                                    <span className={`severity-badge ${getSeverityClass(violation.severity)}`}>
                                        {violation.severity}
                                    </span>
                                    <span className="checkbox-indicator" aria-hidden="true">
                                        {isEnabled ? '✓' : ''}
                                    </span>
                                </div>
                                <span className="violation-card__title">{violation.name}</span>
                                <p>{violation.description}</p>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Summary */}
            <div className="config-section summary-section">
                <div className="summary-box">
                    <h4>Current Configuration Summary</h4>
                    <ul>
                        <li>
                            <strong>Snapshots:</strong> 
                            <span className={settings.snapshots_enabled ? 'status-enabled' : 'status-disabled'}>
                                {settings.snapshots_enabled ? 'Enabled' : 'Disabled'}
                            </span>
                        </li>
                        <li>
                            <strong>Cooldown:</strong> {settings.cooldown_seconds} seconds between same violation snapshots
                        </li>
                        <li>
                            <strong>Active Triggers:</strong> {settings.enabled_violations.length} of {AVAILABLE_VIOLATIONS.length} violations
                            {settings.enabled_violations.length > 0 && (
                                <ul className="active-violations-list">
                                    {settings.enabled_violations.map(v => {
                                        const violation = AVAILABLE_VIOLATIONS.find(av => av.id === v);
                                        return violation ? <li key={v}>{violation.name}</li> : null;
                                    })}
                                </ul>
                            )}
                        </li>
                    </ul>
                </div>
            </div>

            {/* Save Button */}
            <div className="config-actions">
                {saveSuccess && (
                    <span className="save-success">✓ Configuration saved successfully!</span>
                )}
                <button 
                    className={`save-btn ${hasChanges ? 'has-changes' : ''}`}
                    onClick={saveConfig}
                    disabled={saving || !hasChanges}
                >
                    {saving ? 'Saving...' : hasChanges ? 'Save Changes' : 'No Changes'}
                </button>
                <button 
                    className="reset-btn"
                    onClick={loadConfig}
                    disabled={saving || !hasChanges}
                >
                    Reset
                </button>
            </div>
        </div>
    );
};

export default SnapshotConfig;

