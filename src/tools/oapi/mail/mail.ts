import { Type, Static } from '@sinclair/typebox';
import type { OpenClawPluginApi } from 'openclaw/plugin-sdk';
import { createToolContext, registerTool } from '../../helpers';

const FeishuMailSchema = Type.Object({
    action: Type.String({ enum: ['list', 'send'], description: '操作类型' }),
    user_mailbox_id: Type.Optional(Type.String({ description: '用户邮箱ID（通常可以传 me）' })),
    to: Type.Optional(Type.String({ description: '收件人地址（逗号分隔），发送时必填' })),
    subject: Type.Optional(Type.String({ description: '邮件主题，发送时必填' })),
    body: Type.Optional(Type.String({ description: '邮件正文内容，支持纯文本或HTML，发送时必填' }))
}, { additionalProperties: true });

export function registerFeishuMailTool(api: OpenClawPluginApi) {
    if (!api.config) return false;
    const { toolClient, log } = createToolContext(api, 'feishu_mail');
    
    return registerTool(api, {
        name: 'feishu_mail',
        label: 'Feishu: Mail',
        description: '飞书用户身份邮箱工具。用于以用户身份收发、查询飞书邮件。\nActions:\n- list (列出收件箱邮件)\n- send (发送邮件)',
        parameters: FeishuMailSchema,
        async execute(_toolCallId: string, params: Static<typeof FeishuMailSchema>) {
            const client = toolClient();
            const action = params.action;
            const mailboxId = params.user_mailbox_id || 'me';

            switch (action) {
                case 'list': {
                    log.info(`mail list: mailboxId=${mailboxId}`);
                    let listRes: any;
                    try {
                        listRes = await client.invoke('feishu_mail.list', async (sdk, opts) => {
                            return await sdk.request({
                                method: 'GET',
                                url: `/open-apis/mail/v1/user_mailboxes/${mailboxId}/messages`,
                                params: { page_size: 5, folder_id: 'INBOX' }
                            }, opts); // <-- PASS OPTS HERE
                        }, { as: 'user' });
                    } catch (e: any) {
                        throw new Error("MAIL_API_ERROR: " + JSON.stringify(e.response?.data || e.message));
                    }
                    
                    const messageIds = listRes.data?.items || [];
                    if (messageIds.length === 0) {
                        return JSON.stringify({ message: "No recent emails found in INBOX." });
                    }
                    
                    const details: any[] = [];
                    for (const msgId of messageIds) {
                        try {
                            const rawRes = await client.invoke('feishu_mail.list', async (sdk, opts) => {
                                return await sdk.request({
                                    method: 'GET',
                                    url: `/open-apis/mail/v1/user_mailboxes/${mailboxId}/messages/${msgId}?text_format=text`,
                                }, opts); // <-- PASS OPTS HERE
                            }, { as: 'user' });

                            const msg = rawRes.data?.message || {};
                            
                            const subject = msg.subject || "No Subject";
                            const from = msg.head_from?.mail_address || "Unknown Sender";
                            const snippet = msg.body_plain_text ? msg.body_plain_text.substring(0, 150) + "..." : "No preview available";

                            details.push({
                                id: msgId,
                                subject,
                                from,
                                snippet
                            });
                        } catch (e: any) {
                            log.error(`Failed to fetch details for message ${msgId}: ${e.message}`);
                        }
                    }

                    return JSON.stringify({ recent_emails: details }, null, 2);
                }
                case 'send': {
                    if (!params.to || !params.subject || !params.body) {
                        throw new Error('Missing required fields for send: to, subject, body');
                    }
                    log.info(`mail send: to=${params.to}, subject=${params.subject}`);
                    
                    const toAddrs = params.to.split(',').map((e: string) => ({ mail_address: e.trim() }));
                    
                    let sendRes: any;
                    sendRes = await client.invoke('feishu_mail.send', async (sdk, opts) => {
                        log.info("MAIL SEND OPTS: " + JSON.stringify(opts));
                        try {
                            return await sdk.mail.v1.userMailboxMessage.send({
                                path: { user_mailbox_id: mailboxId },
                                data: {
                                    subject: params.subject,
                                    to: toAddrs,
                                    body_html: params.body
                                }
                            }, opts);
                        } catch (e: any) {
                            throw new Error("MAIL_SEND_ERROR: " + JSON.stringify(e.response?.data || e.message));
                        }
                    }, { as: 'user' });
                    
                    return JSON.stringify({ success: true, message: 'Email sent successfully', ...sendRes.data }, null, 2);
                }
                default:
                    throw new Error(`Unsupported mail action: ${action}`);
            }
        }
    });
}
