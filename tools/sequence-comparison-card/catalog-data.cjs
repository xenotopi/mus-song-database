"use strict";

function sequenceComparisonValues(id, post) {
  const required = (value, key) => {
    if (typeof value !== "string" || !value.trim()) throw new Error(`${id}: ${key}が必要です。`);
    return value.trim();
  };
  if (!Array.isArray(post.records) || post.records.length !== 3) throw new Error(`${id}: 比較記録は3件必要です。`);
  const records = post.records.map((record, index) => {
    const result = {};
    for (const key of ["year", "label", "value", "unit", "heading"]) result[key] = required(record[key], `records[${index}].${key}`);
    if (!Array.isArray(record.details) || record.details.length > 4) throw new Error(`${id}: detailsは4行以内の配列です。`);
    result.details = record.details.map((line) => required(line, "details"));
    return result;
  });
  return {
    id, title: required(post.title, "title"), context: required(post.context, "context"),
    conclusion: required(post.conclusion, "conclusion"), records: JSON.stringify(records),
    note: required(post.note, "note"), todayDate: required(post.todayDate, "todayDate"),
    todayText: required(post.todayText, "todayText")
  };
}

module.exports = { sequenceComparisonValues };
