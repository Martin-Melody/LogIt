package ie.logit.app;

import android.service.notification.NotificationListenerService;

/**
 * Does nothing on purpose. Android only lets an app see other apps' media sessions
 * (MediaSessionManager.getActiveSessions) when it is an enabled notification listener,
 * so this service exists to be switched on in Settings › Notification access.
 * It never reads, stores or sends notifications: onNotificationPosted is not overridden.
 */
public class MediaListenerService extends NotificationListenerService {
}
