const JST_TIME_ZONE =
  "Asia/Tokyo";

const JST_OFFSET_MS =
  9 * 60 * 60 * 1000;

const JST_DATE_FORMATTER =
  new Intl.DateTimeFormat(
    "en-US",
    {
      timeZone:
        JST_TIME_ZONE,

      year:
        "numeric",

      month:
        "2-digit",

      day:
        "2-digit"
    }
  );


export function getJstDateKey(
  dateValue = new Date()
) {
  const date =
    Object.prototype.toString.call(
      dateValue
    ) === "[object Date]" &&
    !Number.isNaN(
      dateValue.getTime()
    )
      ? dateValue
      : new Date();

  const parts = {};

  JST_DATE_FORMATTER
    .formatToParts(date)
    .forEach(part => {
      if (
        part.type === "year" ||
        part.type === "month" ||
        part.type === "day"
      ) {
        parts[part.type] =
          part.value;
      }
    });

  return [
    parts.year,
    parts.month,
    parts.day
  ].join("-");
}


export function isHomeResponseForJstDate(
  response,
  dateValue = new Date()
) {
  const responseDateKey =
    String(
      response?.data?.today
        ?.dateKey ||
      ""
    ).trim();

  return Boolean(
    responseDateKey &&
    responseDateKey ===
      getJstDateKey(dateValue)
  );
}


export function getMillisecondsUntilNextJstDay(
  nowMs = Date.now()
) {
  const normalizedNow =
    Number(nowMs);

  const safeNow =
    Number.isFinite(normalizedNow)
      ? normalizedNow
      : Date.now();

  const shifted =
    new Date(
      safeNow +
      JST_OFFSET_MS
    );

  const nextJstMidnight =
    Date.UTC(
      shifted.getUTCFullYear(),
      shifted.getUTCMonth(),
      shifted.getUTCDate() + 1
    ) -
    JST_OFFSET_MS;

  return Math.max(
    1,
    nextJstMidnight -
      safeNow
  );
}
