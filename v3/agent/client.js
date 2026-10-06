const fs = require('node:fs');
const path = require('node:path');

function createMuseClient(env = process.env) {
    if (!env.MUSE_API_KEY) throw Object.assign(new Error('Agent is not configured'), { status: 503 });
    const baseURL = env.MUSE_BASE_URL || 'https://api.meta.ai/v1';
    const url = new URL(baseURL);
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Invalid Muse base URL');
    const OpenAI = require('openai');
    const client = new OpenAI({ baseURL, apiKey: env.MUSE_API_KEY, timeout: 15000, maxRetries: 0 });
    return (messages, tools) => client.chat.completions.create({
        model: env.MUSE_MODEL || 'muse-spark-1.3', messages, tools,
        parallel_tool_calls: true, max_completion_tokens: 2048,
    });
}

function loadPrompt() {
    // No fallback: a missing supplied prompt must disable the agent.
    return fs.readFileSync(path.resolve(__dirname, '../../docs/agent/GCSC-agent-system-prompt.md'), 'utf8');
}

module.exports = { createMuseClient, loadPrompt };
