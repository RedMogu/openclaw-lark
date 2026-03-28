import type { OpenClawPluginApi } from 'openclaw/plugin-sdk';
import { registerFeishuMailTool } from './mail';

export function registerFeishuMailTools(api: OpenClawPluginApi) {
    if (registerFeishuMailTool(api)) {
        api.logger.info?.('feishu_mail: Registered feishu_mail_tool');
    }
}
