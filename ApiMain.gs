/**
 * μ's Song Database API
 * ApiMain.gs
 * JSON / JSONP 対応版
 */

function doGet(event) {
  const parameters =
    event && event.parameter
      ? event.parameter
      : {};

  const action = String(
    parameters.action || ''
  ).trim();

  const callbackName = String(
    parameters.callback || ''
  ).trim();

  try {
    if (!action) {
      return createSuccessResponse_(
        {
          service: "μ's Song Database API",
          status: 'running',
          availableActions: [
            'song',
            'event',
            'search',
          ],
          usageExamples: {
            song: '?action=song&id=S003',
            event: '?action=event&id=EV0002',
            search: '?action=search&q=Snow',
            jsonp:
              '?action=event&id=EV0002&callback=musCallback',
          },
        },
        callbackName
      );
    }

    switch (action) {
      case 'song':
        return createSuccessResponse_(
          getSongDetail_(parameters.id),
          callbackName
        );

      case 'event':
        return createSuccessResponse_(
          getEventDetail_(parameters.id),
          callbackName
        );

      case 'search':
        return createSuccessResponse_(
          searchDatabase_(parameters.q),
          callbackName
        );

      default:
        return createErrorResponse_(
          'UNKNOWN_ACTION',
          '未対応のactionです：' + action,
          { action: action },
          callbackName
        );
    }

  } catch (error) {
    console.error(error);

    const isApiError =
      error instanceof ApiError_;

    return createErrorResponse_(
      isApiError
        ? error.code
        : 'INTERNAL_ERROR',

      error && error.message
        ? error.message
        : 'API処理中にエラーが発生しました。',

      isApiError
        ? error.details
        : null,

      callbackName
    );
  }
}

function testJsonpResponse() {
  const output = createSuccessResponse_(
    {
      message: 'JSONP OK',
      eventId: 'EV0002',
    },
    'callbackTest'
  );

  console.log(
    output.getContent()
  );
}
