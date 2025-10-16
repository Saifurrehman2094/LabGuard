import React, { useEffect, useState } from 'react';
import './Notification.css';

interface NotificationProps {
    message: string;
    type: 'info' | 'success' | 'warning' | 'error';
    duration?: number;
    onClose?: () => void;
}

const Notification: React.FC<NotificationProps> = ({
    message,
    type,
    duration = 5000,
    onClose
}) => {
    const [isVisible, setIsVisible] = useState(true);

    useEffect(() => {
        if (duration > 0) {
            const timer = setTimeout(() => {
                setIsVisible(false);
                if (onClose) {
                    setTimeout(onClose, 300); // Wait for fade out animation
                }
            }, duration);

            return () => clearTimeout(timer);
        }
    }, [duration, onClose]);

    const handleClose = () => {
        setIsVisible(false);
        if (onClose) {
            setTimeout(onClose, 300);
        }
    };

    if (!isVisible) {
        return null;
    }

    return (
        <div className={`notification notification-${type} ${isVisible ? 'show' : ''}`}>
            <div className="notification-content">
                <span className="notification-message">{message}</span>
                <button
                    className="notification-close"
                    onClick={handleClose}
                    aria-label="Close notification"
                >
                    ×
                </button>
            </div>
        </div>
    );
};

export default Notification;