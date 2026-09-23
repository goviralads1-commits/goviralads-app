const invalid = message => Object.assign(new Error(message), { status: 400 });

const readText = (value, limit, label) => {
  if (value == null) return '';
  if (typeof value !== 'string' || value.length > limit) throw invalid(`Invalid ${label}`);
  return value.trim();
};

// Runs before the existing checkout transaction; never receives or returns file bytes.
async function validateOrderInputs(items, clientId, validateAttachment) {
  const normalized = [];
  const uploads = new Map();
  for (const item of items) {
    const quantity = Math.max(1, parseInt(item.quantity) || 1);
    if (!Array.isArray(item.inputs) || item.inputs.length !== quantity) {
      throw invalid(`Provide content for all ${quantity} units of each plan`);
    }
    const inputs = item.inputs.map((input, index) => {
      if (!input || typeof input !== 'object' || Array.isArray(input)) throw invalid('Invalid unit input');
      const link = readText(input.link, 2048, 'link');
      const customInput = readText(input.customInput, 4000, 'instructions');
      if (link) {
        let parsed;
        try { parsed = new URL(link); } catch (_) { throw invalid('Enter a valid HTTP or HTTPS link'); }
        if (!['http:', 'https:'].includes(parsed.protocol)) throw invalid('Only HTTP or HTTPS links are allowed');
      }
      const result = { link, customInput };
      if (input.attachment != null) {
        const att = input.attachment;
        if (!att || typeof att !== 'object' || Array.isArray(att) || typeof att.key !== 'string') {
          throw invalid('Invalid file reference');
        }
        let upload = uploads.get(att.key);
        if (upload && (upload.attachment.size !== att.size || upload.attachment.mime !== att.mime)) {
          throw invalid('Conflicting file references');
        }
        if (!upload) {
          upload = { attachment: att, targets: [] };
          uploads.set(att.key, upload);
        }
        upload.targets.push(result);
      } else if (!link && !customInput) {
        throw invalid(`Item ${index + 1} requires a link, instructions, or an uploaded file`);
      }
      return result;
    });
    normalized.push(inputs);
  }

  // Bound storage HEAD concurrency; duplicate references are checked only once.
  const pending = [...uploads.values()];
  for (let offset = 0; offset < pending.length; offset += 4) {
    await Promise.all(pending.slice(offset, offset + 4).map(async upload => {
      const attachment = await validateAttachment(clientId, upload.attachment);
      for (const target of upload.targets) target.attachment = attachment;
    }));
  }
  return normalized;
}

function orderContentFiles(order) {
  return (order.items || []).flatMap(item => (item.inputs || []).flatMap((input, unitIndex) =>
    input.attachment ? [{ ...input.attachment, title: item.planTitle, unitIndex }] : []));
}

module.exports = { validateOrderInputs, orderContentFiles };
