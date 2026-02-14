// src/utils/ai.js
/**
 * Replace this with a real call to OpenAI / any LLM.
 * For now it just returns a short excerpt.
 */
async function summarize(text) {
  if (!text) return '';
  return text.slice(0, 150) + (text.length > 150 ? '…' : '');
}

module.exports = { summarize };
