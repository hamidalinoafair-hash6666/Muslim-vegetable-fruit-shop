/**
 * WhatsApp & SMS Dispatch Notification Service
 * Note: Automated background delivery requires official WhatsApp Business Cloud API credentials
 * (WHATSAPP_CLOUD_TOKEN & WHATSAPP_PHONE_NUMBER_ID) in server environment variables.
 * Without Cloud API credentials, click-to-chat wa.me links are generated for manual tap-to-send.
 */

export interface NotificationLog {
  id: string;
  channel: 'whatsapp_cloud' | 'sms_webhook' | 'click_to_chat_prepared';
  recipient: 'rider' | 'admin' | 'customer';
  recipient_phone: string;
  order_id: string;
  message_content: string;
  status: 'sent_via_api' | 'prepared_link_only';
  timestamp: string;
  note?: string;
}

const notificationLogs: NotificationLog[] = [];

export function formatRiderWhatsAppMessage(order: any, stopNumber?: number): string {
  const itemsText = (order.items || [])
    .map((item: any) => `• ${item.urdu_name || item.product_name} — ${item.weight_grams || item.quantity * 1000}g (Rs.${item.subtotal})`)
    .join('\n');

  const collectAmount =
    order.payment_method === 'Cash on Delivery' || order.payment_status === 'COD Pending'
      ? `Rs. ${order.total_amount} (Cash to Collect)`
      : order.payment_status === 'Verified'
      ? 'Rs. 0 (Verified Paid)'
      : `Rs. 0 Online — Status: ${order.payment_status} (Confirm with Owner before handover)`;

  return `🛵 *KHANEWAL RIDER DISPATCH - STOP #${stopNumber || 1}*
Order: #${order.id}
Customer: ${order.customer_name} (${order.customer_phone})
Area: ${order.delivery_area}
Address: ${order.delivery_address}
Delivery Fee: Rs. ${order.delivery_fee} (${order.delivery_distance_km} km)
${collectAmount}

Items:
${itemsText}
${order.notes ? `\nNote: ${order.notes}` : ''}
Shop WhatsApp: +923007466664`;
}

export function formatAdminOrderNotification(order: any): string {
  return `📢 *NEW ORDER #${order.id} - KHANEWAL*
Customer: ${order.customer_name} (${order.customer_phone})
Area: ${order.delivery_area} (${order.delivery_distance_km} km)
Total: Rs. ${order.total_amount} (Delivery: Rs. ${order.delivery_fee})
Payment: ${order.payment_method} (${order.payment_status})
Time: ${new Date().toLocaleTimeString('en-PK')}`;
}

export async function dispatchNotification(
  recipient: 'rider' | 'admin' | 'customer',
  recipient_phone: string,
  order: any,
  stopNumber?: number
): Promise<NotificationLog> {
  const content =
    recipient === 'rider'
      ? formatRiderWhatsAppMessage(order, stopNumber)
      : formatAdminOrderNotification(order);

  const cloudToken = process.env.WHATSAPP_CLOUD_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  let status: NotificationLog['status'] = 'prepared_link_only';
  let channel: NotificationLog['channel'] = 'click_to_chat_prepared';
  let note = 'Official WhatsApp Cloud API not configured in env; use WhatsApp click-to-chat button in UI.';

  if (cloudToken && phoneId) {
    try {
      const toDigits = recipient_phone.replace(/\D/g, '').replace(/^0/, '92');
      const res = await fetch(`https://graph.facebook.com/v19.0/${phoneId}/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${cloudToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: toDigits,
          type: 'text',
          text: { body: content },
        }),
      });
      if (res.ok) {
        status = 'sent_via_api';
        channel = 'whatsapp_cloud';
        note = 'Sent via official Meta WhatsApp Business Cloud API.';
      } else {
        note = `WhatsApp Cloud API returned HTTP ${res.status}`;
      }
    } catch (err: any) {
      note = `WhatsApp Cloud API network error: ${err?.message || 'unknown'}`;
    }
  }

  const log: NotificationLog = {
    id: `notif-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    channel,
    recipient,
    recipient_phone,
    order_id: order.id,
    message_content: content,
    status,
    timestamp: new Date().toISOString(),
    note,
  };

  notificationLogs.unshift(log);
  if (notificationLogs.length > 100) notificationLogs.pop();

  return log;
}

export function getNotificationLogs(): NotificationLog[] {
  return notificationLogs;
}
