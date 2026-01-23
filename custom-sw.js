// Custom Service Worker to handle push subscription changes
// This extends the Angular service worker functionality

importScripts('./ngsw-worker.js');

// Handle push subscription changes (important for iOS)
self.addEventListener('pushsubscriptionchange', async event => {
  console.log('Push subscription changed');

  event.waitUntil(
    (async () => {
      try {
        // Get the new subscription
        const newSubscription = await self.registration.pushManager.subscribe(event.oldSubscription.options);

        // Convert subscription to our format
        const key = newSubscription.getKey('p256dh');
        const auth = newSubscription.getKey('auth');

        if (!key || !auth) {
          console.error('Failed to get subscription keys');
          return;
        }

        const subscriptionData = {
          endpoint: newSubscription.endpoint,
          p256dh: arrayBufferToBase64(key),
          auth: arrayBufferToBase64(auth),
        };

        // Update subscription in Supabase
        await updateSubscriptionInSupabase(subscriptionData);

        console.log('Push subscription updated successfully');
      } catch (error) {
        console.error('Error handling subscription change:', error);
      }
    })(),
  );
});

// Helper function to convert ArrayBuffer to Base64
function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// Get cached push API key
async function getPushApiKey() {
  try {
    const cache = await caches.open('push-data');
    const response = await cache.match('/push-api-key');

    if (!response) {
      console.error('No push API key found in cache');
      return null;
    }

    const data = await response.json();
    return data.key;
  } catch (error) {
    console.error('Error getting push API key:', error);
    return null;
  }
}

// Get cached Supabase config
async function getSupabaseConfig() {
  try {
    const cache = await caches.open('push-data');
    const response = await cache.match('/supabase-config');

    if (!response) {
      console.error('No Supabase config found in cache');
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error('Error getting Supabase config:', error);
    return null;
  }
}

// Update subscription in Supabase using push API key
async function updateSubscriptionInSupabase(subscriptionData) {
  try {
    // Get cached data
    const pushApiKey = await getPushApiKey();
    const config = await getSupabaseConfig();

    if (!pushApiKey || !config) {
      console.error('Missing push API key or config');
      return;
    }

    // Update subscription in Supabase
    const response = await fetch(`${config.supabaseUrl}/rest/v1/push_subscriptions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: config.supabaseKey,
        'x-push-api-key': pushApiKey,
        Prefer: 'resolution=merge-duplicates',
      },
      body: JSON.stringify({
        endpoint: subscriptionData.endpoint,
        p256dh: subscriptionData.p256dh,
        auth: subscriptionData.auth,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to update subscription: ${response.statusText} - ${errorText}`);
    }

    console.log('Subscription updated in Supabase');
  } catch (error) {
    console.error('Error updating subscription in Supabase:', error);
    throw error;
  }
}
