// logic/logicEngine.js

function applyGPTLogic(data, operation) {
  if (operation.type === 'pipeline' && Array.isArray(operation.steps)) {
    return operation.steps.reduce((current, step) => applyGPTLogic(current, step), data);
  }

  const {
    type,
    field,
    operator,
    value,
    groupByField,
    aggregateField,
    sortOrder,
    sortField
  } = operation;

  let actualValue = parseSpecialValue(data, value);

  if (type === 'filter') {
    return data.filter(row => {
      const cell = row[field];
      switch (operator) {
        case '==': return cell == actualValue;
        case '!=': return cell != actualValue;
        case '>': return parseFloat(cell) > parseFloat(actualValue);
        case '<': return parseFloat(cell) < parseFloat(actualValue);
        case '>=': return parseFloat(cell) >= parseFloat(actualValue);
        case '<=': return parseFloat(cell) <= parseFloat(actualValue);
        case 'contains': return cell?.toString().toLowerCase().includes(actualValue.toString().toLowerCase());
        case 'in': return Array.isArray(actualValue) && actualValue.includes(cell);
        default: return false;
      }
    });
  }

  if (type === 'groupBy') {
    const groups = {};
    data.forEach(row => {
      const key = row[groupByField];
      const val = parseFloat(row[aggregateField] || 0);
      groups[key] = (groups[key] || 0) + val;
    });

    return Object.entries(groups).map(([key, total]) => ({
      [groupByField]: key,
      [aggregateField]: total
    }));
  }

  if (type === 'aggregate') {
    const values = data.map(row => parseFloat(row[aggregateField])).filter(v => !isNaN(v));

    switch (operator) {
      case 'sum': return [{ [aggregateField]: sum(values) }];
      case 'count': return [{ count: values.length }];
      case 'avg': return [{ [aggregateField]: avg(values) }];
      case 'min': return [{ [aggregateField]: Math.min(...values) }];
      case 'max': return [{ [aggregateField]: Math.max(...values) }];
      case 'median': return [{ [aggregateField]: median(values) }];
      default: return [];
    }
  }

  if (type === 'topK') {
    const sorted = [...data].sort((a, b) => parseFloat(b[field]) - parseFloat(a[field]));
    const k = typeof actualValue === 'number' ? actualValue : 5;
    return sorted.slice(0, k);
  }

  if (type === 'sort') {
    const dir = sortOrder?.toLowerCase() === 'asc' ? 1 : -1;
    const sorted = [...data].sort((a, b) => {
      const aVal = a[sortField];
      const bVal = b[sortField];
      return (aVal > bVal ? 1 : aVal < bVal ? -1 : 0) * dir;
    });
    return sorted;
  }

  if (type === 'distinct') {
    const seen = new Set();
    return data.reduce((acc, row) => {
      const val = row[field];
      if (!seen.has(val)) {
        seen.add(val);
        acc.push({ [field]: val });
      }
      return acc;
    }, []);
  }

  return [];
}
function parseSpecialValue(data, value) {
  if (typeof value === 'number') return value;

  if (typeof value === 'string') {
    const match = value.match(/(average|avg|median|min|max)\s+(.+)/i);
    if (!match) return value;

    const [, op, field] = match;
    const values = data.map(row => parseFloat(row[field])).filter(n => !isNaN(n));
    if (values.length === 0) return 0;

    switch (op.toLowerCase()) {
      case 'average':
      case 'avg': return avg(values);
      case 'median': return median(values);
      case 'min': return Math.min(...values);
      case 'max': return Math.max(...values);
    }
  }

  return value;
}

function sum(arr) {
  return arr.reduce((a, b) => a + b, 0);
}

function avg(arr) {
  return sum(arr) / arr.length;
}

function median(arr) {
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}


module.exports = { applyGPTLogic };
