/** Provider boundary for Phase 3. Browser responses never confirm payments. */
export interface VerifiedPayment { providerEventId:string; invoiceId:string; amountPaise:number; reference:string; paidAt:string; }
export interface PaymentProvider { verifyWebhook(rawBody:string,signature:string):Promise<VerifiedPayment>; }
export interface WhatsAppProvider { sendApprovedTemplate(input:{to:string;template:string;language:string;parameters:string[];consentReference:string}):Promise<{messageId:string}>; }
export const integrationConfiguration = {
 payments: {enabled:false, requiredSecrets:['PAYMENT_PROVIDER_SECRET','PAYMENT_WEBHOOK_SECRET'],requiredConfiguration:['PAYMENT_PROVIDER_PUBLIC_KEY','PAYMENT_WEBHOOK_URL']},
 whatsapp: {enabled:false,requiredSecrets:['WHATSAPP_ACCESS_TOKEN','WHATSAPP_WEBHOOK_VERIFY_TOKEN'],requiredConfiguration:['WHATSAPP_PHONE_NUMBER_ID','WHATSAPP_TEMPLATE_LANGUAGE']},
} as const;
