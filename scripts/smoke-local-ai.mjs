const runtimeUrl = (process.env.OPENAI_COMPATIBLE_URL ?? 'http://localhost:11435/v1').replace(/\/$/, '');
const apiUrl = (process.env.API_URL ?? 'http://localhost:3001/api').replace(/\/$/, '');

const modelsResponse = await fetch(`${runtimeUrl}/models`);
if (!modelsResponse.ok) throw new Error(`Модельный runtime недоступен: HTTP ${modelsResponse.status}`);

const parseResponse = await fetch(`${apiUrl}/drafts/parse`, {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'x-demo-user': 'customer'
  },
  body: JSON.stringify({
    text: 'Нужен автокран 25 тонн в Чебоксарах завтра к 9:00 на 8 часов, адрес: улица Калинина, 109, узкий въезд со двора'
  })
});
const result = await parseResponse.json();
if (!parseResponse.ok) throw new Error(`Backend вернул HTTP ${parseResponse.status}: ${JSON.stringify(result)}`);
if (result.fallback) throw new Error(`Backend использовал fallback: ${result.notice ?? 'причина не указана'}`);
if (result.draft?.parserProvider !== 'openai_compatible') {
  throw new Error(`Ожидался openai_compatible, получен ${result.draft?.parserProvider ?? 'unknown'}`);
}

console.log(JSON.stringify({
  provider: result.draft.parserProvider,
  category: result.draft.category,
  scheduledAt: result.draft.scheduledAt,
  durationHours: result.draft.durationHours,
  locality: result.draft.locality,
  constraints: result.draft.constraints
}, null, 2));
