import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  ArrowLeft, Bell, BriefcaseBusiness, Building2, CalendarClock, Check, ChevronRight,
  CircleAlert, Clock3, FileText, HardHat, LoaderCircle, MapPin, MessageSquareText,
  Mic, Pencil, PhoneCall, Plus, RefreshCw, RotateCcw, Send, Sparkles, Star, Trash2, Truck, UserRound, X,
  ImagePlus, LocateFixed, Map, Paperclip, Ruler
} from 'lucide-react';
import { CircleMarker, MapContainer, TileLayer, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { api, ApiClientError, getDemoAlias, setDemoAlias, type DraftFields } from './api';
import { categoryLabels, dateTime, money, statusLabels } from './format';
import type { Category, DemoUser, Draft, DraftAttachment, Meta, Notification, Order, OrderStatus, Proposal, SupplierEquipment, User } from './types';

type Section = 'new' | 'orders' | 'supplier' | 'equipment' | 'notifications';
type Flow = 'start' | 'form' | 'proposals' | 'success';

const demoBuild = import.meta.env.VITE_DEMO_AUTH === 'true';

const requestExamples = [
  {
    id: 'crane',
    title: 'Поднять плиты краном',
    text: 'Нужен автокран 25 тонн в Чебоксарах завтра к 9:00 на 8 часов. Объект: ул. Калинина, 80, монтаж плит 8 т на высоту 12 м, узкий въезд на площадку'
  },
  {
    id: 'dump-truck',
    title: 'Вывезти грунт самосвалом',
    text: 'Нужен самосвал КамАЗ в Новочебоксарске завтра к 8:00 на смену. Объект: промзона у Восточного шоссе, вывезти 40 м³ грунта, подъезд по грунтовой дороге'
  },
  {
    id: 'tractor',
    title: 'Спланировать участок трактором',
    text: 'Нужен трактор с отвалом в Чебоксарах завтра к 10:00 на 4 часа. Ориентир: двор у ТЦ Мадагаскар, спланировать 600 м², ограниченный проезд во двор'
  }
] as const;

const specificationFields: Record<Category, string[]> = {
  MOBILE_CRANE: ['Грузоподъемность', 'Стрела', 'Дополнительно'],
  TRACTOR: ['Навесное', 'Мощность', 'Дополнительно'],
  DUMP_TRUCK: ['Грузоподъемность', 'Кузов', 'Дополнительно'],
  BACKHOE_LOADER: ['Ковш', 'Глубина копания', 'Дополнительно']
};

function tomorrowLocal(): string {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(9, 0, 0, 0);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function toLocalInput(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function localDateAt(dayOffset: number, hours: number): string {
  const date = new Date();
  date.setDate(date.getDate() + dayOffset);
  date.setHours(hours, 0, 0, 0);
  return toLocalInput(date.toISOString());
}

function formatBytes(value: number): string {
  return value >= 1_000_000 ? `${(value / 1_000_000).toFixed(1)} МБ` : `${Math.ceil(value / 1_000)} КБ`;
}

function specificationEntries(specifications: Record<string, string>, limit?: number): Array<[string, string]> {
  const entries = Object.entries(specifications).filter(([, value]) => value.trim());
  return typeof limit === 'number' ? entries.slice(0, limit) : entries;
}

function readImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      reject(new Error('Загрузите JPG, PNG или WebP'));
      return;
    }
    if (file.size > 3_000_000) {
      reject(new Error('Фото должно быть до 3 МБ'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Не удалось прочитать файл'));
    reader.readAsDataURL(file);
  });
}

function MapClickMarker({ value, onChange }: { value: { latitude: number; longitude: number } | null; onChange: (value: { latitude: number; longitude: number }) => void }) {
  useMapEvents({ click: (event) => onChange({ latitude: event.latlng.lat, longitude: event.latlng.lng }) });
  return value ? <CircleMarker center={[value.latitude, value.longitude]} radius={9} pathOptions={{ color: '#ffffff', weight: 3, fillColor: '#167a5b', fillOpacity: 1 }} /> : null;
}

function LocationPicker({ value, onChange }: { value: { latitude: number; longitude: number } | null; onChange: (value: { latitude: number; longitude: number }) => void }) {
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState('');
  const locate = () => {
    if (!navigator.geolocation) { setError('Геолокация не поддерживается на этом устройстве'); return; }
    setLocating(true); setError('');
    navigator.geolocation.getCurrentPosition(
      (position) => { onChange({ latitude: position.coords.latitude, longitude: position.coords.longitude }); setLocating(false); },
      () => { setError('Не удалось определить позицию. Поставьте метку вручную.'); setLocating(false); },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 }
    );
  };
  const center: [number, number] = value ? [value.latitude, value.longitude] : [56.1439, 47.2489];
  return <div className="location-picker">
    <div className="location-picker-head"><div><span>Метка объекта</span><small>{value ? `${value.latitude.toFixed(5)}, ${value.longitude.toFixed(5)}` : 'Нажмите на карту, чтобы поставить точку'}</small></div><button type="button" className="icon-button" title="Определить моё местоположение" aria-label="Определить моё местоположение" onClick={locate} disabled={locating}>{locating ? <LoaderCircle className="spin" /> : <LocateFixed />}</button></div>
    <MapContainer key={`${center[0]}-${center[1]}`} center={center} zoom={13} className="request-map" scrollWheelZoom={false} aria-label="Карта выбора объекта">
      <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <MapClickMarker value={value} onChange={onChange} />
    </MapContainer>
    {error && <small className="location-error">{error}</small>}
  </div>;
}

function Empty({ icon, title, text, action }: { icon: ReactNode; title: string; text: string; action?: ReactNode }) {
  return <div className="empty-state"><div className="empty-icon">{icon}</div><h3>{title}</h3><p>{text}</p>{action}</div>;
}

function Spinner({ label = 'Загрузка' }: { label?: string }) {
  return <div className="loading"><LoaderCircle className="spin" size={22} /><span>{label}</span></div>;
}

function App() {
  const maxLaunch = Boolean(window.WebApp?.initData);
  const [section, setSection] = useState<Section>('new');
  const [user, setUser] = useState<User | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [demoUsers, setDemoUsers] = useState<DemoUser[]>([]);
  const [booting, setBooting] = useState(true);
  const [fatal, setFatal] = useState('');
  const [toast, setToast] = useState('');

  const loadSession = useCallback(async () => {
    setBooting(true);
    setFatal('');
    try {
      const [me, loadedMeta] = await Promise.all([api.me(), api.meta()]);
      setUser(me.user);
      setMeta(loadedMeta);
      if (demoBuild && !maxLaunch) setDemoUsers((await api.demoUsers()).users);
    } catch (error) {
      setFatal(error instanceof Error ? error.message : 'Сервис недоступен');
    } finally {
      setBooting(false);
    }
  }, []);

  useEffect(() => { void loadSession(); }, [loadSession]);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    if (user?.role === 'DISPATCHER' && (section === 'new' || section === 'supplier')) setSection('orders');
  }, [section, user]);

  const switchRole = async (alias: string) => {
    setDemoAlias(alias);
    setSection(alias === 'customer' ? 'new' : 'orders');
    await loadSession();
  };

  if (booting) return <div className="boot"><div className="brand-mark"><HardHat size={25} /></div><Spinner label="Открываем ТехЗаказ" /></div>;
  if (fatal || !user || !meta) return <div className="boot error-page"><CircleAlert size={32} /><h1>Не удалось открыть сервис</h1><p>{fatal || 'Нет данных сессии'}</p><button className="button primary" onClick={() => void loadSession()}><RefreshCw size={18} />Повторить</button></div>;

  const customer = user.role === 'CUSTOMER';
  const navigation: Array<{ id: Section; label: string; icon: ReactNode }> = customer ? [
    { id: 'new', label: 'Новая заявка', icon: <Plus /> },
    { id: 'orders', label: 'Мои заявки', icon: <BriefcaseBusiness /> },
    { id: 'notifications', label: 'Уведомления', icon: <Bell /> },
    { id: 'supplier', label: 'Стать поставщиком', icon: <Building2 /> }
  ] : [
    { id: 'orders', label: 'Заявки поставщика', icon: <BriefcaseBusiness /> },
    { id: 'equipment', label: 'Моя техника', icon: <Truck /> },
    { id: 'notifications', label: 'Уведомления', icon: <Bell /> }
  ];

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark"><HardHat size={22} /></span><span>ТехЗаказ</span></div>
      <nav>{navigation.map((item) => <button key={item.id} className={section === item.id ? 'nav-item active' : 'nav-item'} onClick={() => setSection(item.id)}>{item.icon}<span>{item.label}</span></button>)}</nav>
      <div className="sidebar-note"><Check size={16} /><span>Техника только с экипажем</span></div>
    </aside>

    <div className="workspace">
      <header className="topbar">
        <div className="mobile-brand"><span className="brand-mark"><HardHat size={19} /></span><strong>ТехЗаказ</strong></div>
        {demoBuild && !maxLaunch && <div className="demo-pill"><span className="demo-dot" />Тестовые данные</div>}
        <div className="role-box">
          <UserRound size={18} />
          {demoBuild && !maxLaunch ? <select aria-label="Тестовая роль" data-testid="role-switcher" value={getDemoAlias()} onChange={(event) => void switchRole(event.target.value)}>
            {demoUsers.map((item) => <option key={item.alias} value={item.alias}>{item.name}</option>)}
          </select> : <span>{user.displayName}</span>}
        </div>
      </header>

      <main>
        {section === 'new' && customer && <NewRequest meta={meta} onCreated={() => setSection('orders')} notify={setToast} />}
        {section === 'orders' && <Orders user={user} onNew={() => setSection('new')} notify={setToast} />}
        {section === 'supplier' && customer && <SupplierApplication meta={meta} notify={setToast} />}
        {section === 'equipment' && !customer && <SupplierEquipmentList meta={meta} notify={setToast} />}
        {section === 'notifications' && <Notifications />}
      </main>
    </div>

    <nav className="bottom-nav">{navigation.map((item) => <button key={item.id} className={section === item.id ? 'active' : ''} onClick={() => setSection(item.id)}>{item.icon}<span>{item.id === 'supplier' ? 'Поставщик' : item.label}</span></button>)}</nav>
    {toast && <div role="status" className="toast"><Check size={17} />{toast}</div>}
  </div>;
}

function NewRequest({ meta, onCreated, notify }: { meta: Meta; onCreated: () => void; notify: (message: string) => void }) {
  const [flow, setFlow] = useState<Flow>('start');
  const [text, setText] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [attachments, setAttachments] = useState<DraftAttachment[]>([]);
  const [selected, setSelected] = useState<Proposal | null>(null);
  const [created, setCreated] = useState<Order | null>(null);
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const recordingTimer = useRef<ReturnType<typeof window.setTimeout> | null>(null);

  useEffect(() => () => {
    if (recordingTimer.current) window.clearTimeout(recordingTimer.current);
  }, []);

  const parse = async (sourceText = text) => {
    setBusy(true); setError('');
    try {
      const result = await api.parseDraft(sourceText);
      setDraft(result.draft);
      setNotice(result.notice ?? 'Черновик готов. Проверьте каждое поле перед подбором.');
      setFlow('form');
    } catch (err) { setError(messageOf(err)); }
    finally { setBusy(false); }
  };

  const proposalsReady = (items: Proposal[], reason: string | null) => {
    setProposals(items); setError(reason ?? ''); setFlow('proposals');
  };

  const createOrder = async () => {
    if (!draft || !selected) return;
    setBusy(true); setError('');
    try {
      const result = await api.createOrder(draft.id, selected.id, crypto.randomUUID());
      setCreated(result.order); setSelected(null); setFlow('success'); notify('Заявка отправлена поставщику');
    } catch (err) { setError(messageOf(err)); }
    finally { setBusy(false); }
  };

  const startVoiceDemo = () => {
    if (busy || recording) return;
    setRecording(true); setError('');
    recordingTimer.current = window.setTimeout(() => {
      const voiceText = 'Нужен автокран 25 тонн в Чебоксарах завтра к 9:00 на 8 часов. Объект: ул. Калинина, 80, поднять плиты 8 т на 12 м, узкий въезд';
      setText(voiceText); setRecording(false); void parse(voiceText);
    }, 2_000);
  };

  if (flow === 'start') return <section className="page narrow ai-request-page">
    <div className="page-heading"><div><p className="eyebrow">Новая заявка</p><h1>Какая техника нужна?</h1><p>Опишите задачу своими словами, а мы подберём подходящие варианты с экипажем.</p></div></div>
    <form className={recording ? 'ai-composer recording' : 'ai-composer'} onSubmit={(event) => { event.preventDefault(); void parse(); }}>
      <textarea aria-label="Опишите задачу" rows={5} value={text} maxLength={2000} disabled={busy || recording} onChange={(event) => setText(event.target.value)} placeholder="Например: нужен автокран для разгрузки плит завтра утром в Чебоксарах" data-testid="task-text" />
      <div className="ai-composer-footer"><div className="voice-control"><button type="button" className="mic-button" aria-label="Записать голосом" title="Записать голосом" disabled={busy} onClick={startVoiceDemo}><Mic /></button>{recording && <span className="voice-wave" aria-label="Идёт запись"><i /><i /><i /><i /><i /></span>}<span>{recording ? 'Слушаю задачу...' : 'Можно написать или надиктовать'}</span></div><button className="send-button" type="submit" aria-label="Найти технику" title="Найти технику" disabled={busy || text.trim().length < 10} data-testid="parse-submit">{busy ? <LoaderCircle className="spin" /> : <Send />}</button></div>
    </form>
    {error && <InlineError text={error} />}
    <div className="request-examples" aria-label="Примеры задач"><p>Попробуйте один из сценариев</p><div>{requestExamples.map((example) => <button type="button" key={example.id} className="request-example" disabled={busy || recording} onClick={() => { setText(example.text); void parse(example.text); }} data-testid={`request-example-${example.id}`}><Sparkles size={16} />{example.title}</button>)}</div></div>
    <button className="manual-entry" onClick={() => { setDraft(null); setNotice(''); setFlow('form'); }} data-testid="manual-start"><FileText />Заполнить вручную</button>
  </section>;

  if (flow === 'form') return <DraftForm meta={meta} draft={draft} attachments={attachments} notice={notice} busy={busy} error={error} onBack={() => setFlow('start')} onRemoveAttachment={async (attachmentId) => {
    if (!draft) return;
    try {
      await api.removeDraftAttachment(draft.id, attachmentId);
      setAttachments((items) => items.filter((item) => item.id !== attachmentId));
    } catch (err) { setError(messageOf(err)); }
  }} onSubmit={async (fields, files) => {
    setBusy(true); setError('');
    try {
      const saved = draft ? await api.updateDraft(draft.id, fields) : await api.createDraft(fields);
      setDraft(saved.draft);
      for (const file of files) await api.uploadDraftAttachment(saved.draft.id, file);
      const uploaded = await api.draftAttachments(saved.draft.id);
      setAttachments(uploaded.attachments);
      const result = await api.proposals(saved.draft.id);
      proposalsReady(result.proposals, result.reason);
    } catch (err) { setError(messageOf(err)); }
    finally { setBusy(false); }
  }} />;

  if (flow === 'proposals') return <section className="page proposals-page">
    <Back onClick={() => setFlow('form')} />
    <div className="page-heading row-heading"><div><p className="eyebrow">Подбор завершён</p><h1>Подходящие предложения</h1><p>{proposals.length ? `Найдено ${proposals.length}. Можно выбрать любой вариант.` : 'Измените параметры и попробуйте снова.'}</p></div></div>
    {!proposals.length ? <Empty icon={<HardHat />} title="Подходящих вариантов нет" text={error || 'На выбранное время свободной техники нет.'} action={<button className="button secondary" onClick={() => setFlow('form')}>Изменить параметры</button>} /> : <div className="proposal-list">{proposals.map((item, index) => <article className="proposal" key={item.id}>
      <div className="proposal-image"><img src={item.imagePath} alt={item.title} /><span>#{index + 1}</span></div>
      <div className="proposal-body"><div className="proposal-title"><div><p className="supplier-name">{item.supplier.name}</p><h2>{item.title}</h2></div><strong className="price">{money(item.pricePerShift)}<small>/ смена</small></strong></div>
        <div className="facts"><span><Clock3 />Подача ~{item.responseMinutes} мин</span><span><Star className="star" />{item.supplier.rating} · {item.supplier.reviewCount} отзывов</span></div>
        {!!specificationEntries(item.specifications, 4).length && <div className="spec-list">{specificationEntries(item.specifications, 4).map(([key, value]) => <span key={key}><b>{key}</b>{value}</span>)}</div>}
        <p className="why"><Check />{item.explanation}</p>
        <button className="button primary" onClick={() => setSelected(item)} data-testid={`select-proposal-${index}`}>Выбрать предложение</button>
      </div>
    </article>)}</div>}
    {selected && <ConfirmDialog proposal={selected} draft={draft!} busy={busy} error={error} onClose={() => setSelected(null)} onConfirm={() => void createOrder()} />}
  </section>;

  return <section className="page narrow success-page"><div className="success-icon"><Check /></div><p className="eyebrow">Заявка отправлена</p><h1>{created?.publicNumber}</h1><p>Поставщик получил уведомление. Статус появится в разделе заявок.</p><div className="success-summary"><span>{created?.equipment.title}</span><strong>{created && money(created.pricePerShift)}</strong></div><button className="button primary wide" onClick={onCreated}>Открыть мои заявки</button><button className="button text" onClick={() => { setFlow('start'); setCreated(null); setDraft(null); setText(''); setAttachments([]); }}>Создать ещё одну</button></section>;
}

function DraftForm({ meta, draft, attachments, notice, busy, error, onBack, onSubmit, onRemoveAttachment }: { meta: Meta; draft: Draft | null; attachments: DraftAttachment[]; notice: string; busy: boolean; error: string; onBack: () => void; onSubmit: (fields: DraftFields, files: File[]) => Promise<void>; onRemoveAttachment: (attachmentId: string) => Promise<void> }) {
  const [category, setCategory] = useState(draft?.category ?? '');
  const [scheduledAt, setScheduledAt] = useState(draft ? toLocalInput(draft.scheduledAt) : tomorrowLocal());
  const [duration, setDuration] = useState(String(draft?.durationHours ?? 8));
  const [locality, setLocality] = useState(draft?.locality ?? 'Чебоксары');
  const [siteAddress, setSiteAddress] = useState(draft?.siteAddress ?? '');
  const [coordinates, setCoordinates] = useState<{ latitude: number; longitude: number } | null>(draft?.siteLatitude !== null && draft?.siteLatitude !== undefined && draft?.siteLongitude !== null && draft?.siteLongitude !== undefined ? { latitude: draft.siteLatitude, longitude: draft.siteLongitude } : null);
  const [workVolume, setWorkVolume] = useState(draft?.workVolume ?? '');
  const [description, setDescription] = useState(draft?.workDescription ?? '');
  const [constraints, setConstraints] = useState(draft?.constraints ?? '');
  const [files, setFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState('');

  const chooseFiles = (selected: FileList | null) => {
    if (!selected) return;
    const next = Array.from(selected);
    const invalid = next.find((file) => !['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(file.type) || (file.type === 'application/pdf' ? file.size > 5_000_000 : file.size > 3_000_000));
    if (invalid) { setFileError('Можно добавить фото JPG/PNG/WebP до 3 МБ или PDF до 5 МБ'); return; }
    if (attachments.length + files.length + next.length > 4) { setFileError('Можно приложить до четырёх файлов'); return; }
    setFiles((items) => [...items, ...next]); setFileError('');
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void onSubmit({
      category,
      scheduledAt: new Date(scheduledAt).toISOString(),
      durationHours: Number(duration),
      locality,
      siteAddress,
      siteLatitude: coordinates?.latitude ?? null,
      siteLongitude: coordinates?.longitude ?? null,
      workVolume,
      workDescription: description,
      constraints: constraints || null
    }, files);
  };

  return <section className="page narrow"><Back onClick={onBack} /><div className="page-heading"><div><p className="eyebrow">Проверьте детали</p><h1>Заявка почти готова</h1><p>Поля можно изменить. Ничего не бронируется без вашего выбора.</p></div></div>
    {notice && <div className="notice"><Sparkles size={18} /><span>{notice}</span></div>}
    <form className="form-grid" onSubmit={submit} data-testid="draft-form">
      <label className="field full"><span>Категория техники *</span><select required value={category} onChange={(event) => setCategory(event.target.value)} data-testid="category"><option value="">Выберите категорию</option>{meta.categories.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
      <label className="field"><span>Дата и время *</span><input type="datetime-local" required value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} data-testid="scheduled-at" /><div className="time-presets"><button type="button" onClick={() => setScheduledAt(localDateAt(0, 14))}>Сегодня, 14:00</button><button type="button" onClick={() => setScheduledAt(localDateAt(1, 9))}>Завтра, 09:00</button><button type="button" onClick={() => setScheduledAt(localDateAt(1, 14))}>Завтра, 14:00</button></div></label>
      <label className="field"><span>Длительность, часов *</span><input type="number" min="1" max="168" required value={duration} onChange={(event) => setDuration(event.target.value)} data-testid="duration" /></label>
      <label className="field full"><span>Населённый пункт *</span><input list="localities" required minLength={2} value={locality} onChange={(event) => setLocality(event.target.value)} data-testid="locality" /><datalist id="localities">{meta.localities.map((item) => <option key={item}>{item}</option>)}</datalist></label>
      <label className="field full"><span>Адрес или ориентир объекта *</span><input required minLength={3} maxLength={200} value={siteAddress} onChange={(event) => setSiteAddress(event.target.value)} placeholder="Например: ул. Калинина, 80, въезд со стороны склада" data-testid="site-address" /></label>
      <div className="field full"><LocationPicker value={coordinates} onChange={setCoordinates} /></div>
      <label className="field full"><span>Объём работ *</span><input required minLength={2} maxLength={300} value={workVolume} onChange={(event) => setWorkVolume(event.target.value)} placeholder="Например: 8 т на 12 м, 40 м³ грунта, траншея 30 м" data-testid="work-volume" /></label>
      <label className="field full"><span>Что нужно сделать *</span><textarea rows={4} required minLength={10} maxLength={1000} value={description} onChange={(event) => setDescription(event.target.value)} data-testid="work-description" /></label>
      <label className="field full"><span>Условия на объекте</span><textarea rows={3} maxLength={500} placeholder="Например: узкий въезд, грунт, высота ворот, ЛЭП рядом, нужен пропуск" value={constraints} onChange={(event) => setConstraints(event.target.value)} /></label>
      <div className="field full attachment-field"><span><Paperclip />Фото объекта или ТЗ</span><label className="attachment-input"><ImagePlus /><span>Добавить фото или PDF</span><input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" multiple onChange={(event) => { chooseFiles(event.target.files); event.currentTarget.value = ''; }} /></label><small>До 4 файлов: фото до 3 МБ, PDF до 5 МБ</small>{fileError && <InlineError text={fileError} />}<div className="attachment-list">{attachments.map((attachment) => <div key={attachment.id}><a href={attachment.filePath} target="_blank" rel="noreferrer">{attachment.kind === 'PDF' ? <FileText /> : <ImagePlus />}<span>{attachment.fileName}</span><small>{formatBytes(attachment.sizeBytes)}</small></a><button type="button" className="icon-button danger-icon" title="Удалить вложение" aria-label={`Удалить ${attachment.fileName}`} onClick={() => void onRemoveAttachment(attachment.id)}><Trash2 /></button></div>)}{files.map((file, index) => <div key={`${file.name}-${index}`}><span>{file.type === 'application/pdf' ? <FileText /> : <ImagePlus />}<span>{file.name}</span><small>{formatBytes(file.size)}</small></span><button type="button" className="icon-button danger-icon" title="Убрать файл" aria-label={`Убрать ${file.name}`} onClick={() => setFiles((items) => items.filter((_, itemIndex) => itemIndex !== index))}><X /></button></div>)}</div></div>
      {error && <div className="full"><InlineError text={error} /></div>}
      <div className="sticky-actions full"><button className="button primary wide" disabled={busy} type="submit" data-testid="find-proposals">{busy ? <LoaderCircle className="spin" /> : <HardHat />}Найти предложения</button></div>
    </form>
  </section>;
}

function ConfirmDialog({ proposal, draft, busy, error, onClose, onConfirm }: { proposal: Proposal; draft: Draft; busy: boolean; error: string; onClose: () => void; onConfirm: () => void }) {
  return <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="confirm-title"><div className="modal">
    <button className="icon-button modal-close" aria-label="Закрыть" onClick={onClose}><X /></button><p className="eyebrow">Подтверждение</p><h2 id="confirm-title">Отправить заявку?</h2>
    <div className="confirm-equipment"><img src={proposal.imagePath} alt="" /><div><strong>{proposal.title}</strong><span>{proposal.supplier.name}</span></div></div>
    <dl className="summary-list"><div><dt><CalendarClock />Дата</dt><dd>{draft.scheduledAt && dateTime(draft.scheduledAt)}</dd></div><div><dt><MapPin />Место</dt><dd>{draft.locality}</dd></div><div><dt><Ruler />Объём</dt><dd>{draft.workVolume}</dd></div><div><dt><Clock3 />Длительность</dt><dd>{draft.durationHours} ч</dd></div><div><dt>Стоимость смены</dt><dd>{money(proposal.pricePerShift)}</dd></div></dl>
    <p className="muted">Это заявка поставщику, а не оплата. Диспетчер подтвердит доступность.</p>{error && <InlineError text={error} />}
    <button className="button primary wide" disabled={busy} onClick={onConfirm} data-testid="confirm-order">{busy ? <LoaderCircle className="spin" /> : <Send />}Отправить поставщику</button>
  </div></div>;
}

function Orders({ user, onNew, notify }: { user: User; onNew: () => void; notify: (message: string) => void }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [selected, setSelected] = useState<Order | null>(null);
  const [filter, setFilter] = useState('ALL');
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const customer = user.role === 'CUSTOMER';

  const load = useCallback(async () => {
    setBusy(true); setError('');
    try { setOrders((await api.orders(filter === 'ALL' ? undefined : filter)).orders); }
    catch (err) { setError(messageOf(err)); }
    finally { setBusy(false); }
  }, [filter, user.id]);
  useEffect(() => { void load(); }, [load]);

  const open = async (id: string) => {
    setBusy(true);
    try { setSelected((await api.order(id)).order); }
    catch (err) { setError(messageOf(err)); }
    finally { setBusy(false); }
  };

  return <section className="page orders-page"><div className="page-heading row-heading"><div><p className="eyebrow">{customer ? 'Заказчик' : 'Диспетчер поставщика'}</p><h1>{customer ? 'Мои заявки' : 'Заявки поставщика'}</h1><p>{customer ? 'Следите за решением и ходом работ.' : 'Подтвердите заявку и обновляйте статус работ.'}</p></div>{customer && <button className="button primary desktop-action" onClick={onNew}><Plus />Новая заявка</button>}</div>
    <div className="filters" aria-label="Фильтр статуса">{['ALL', 'NEW', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED'].map((status) => <button key={status} className={filter === status ? 'active' : ''} onClick={() => setFilter(status)}>{status === 'ALL' ? 'Все' : statusLabels[status as OrderStatus]}</button>)}</div>
    {error && <InlineError text={error} />}{busy && !selected ? <Spinner label="Загружаем заявки" /> : !orders.length ? <Empty icon={<BriefcaseBusiness />} title="Заявок пока нет" text={customer ? 'Создайте первую заявку на технику с экипажем.' : 'Новые заявки вашей компании появятся здесь.'} action={customer ? <button className="button primary" onClick={onNew}>Создать заявку</button> : undefined} /> : <div className="order-list">{orders.map((order) => <button className="order-row" key={order.id} onClick={() => void open(order.id)} data-testid={`order-${order.status}`}><span className={`status-dot ${order.status.toLowerCase()}`} /><span className="order-main"><strong>{order.equipment.title}</strong><small>{order.publicNumber} · {dateTime(order.scheduledAt)}</small></span><span className={`status ${order.status.toLowerCase()}`}>{statusLabels[order.status]}</span><ChevronRight /></button>)}</div>}
    {selected && <OrderDetail order={selected} user={user} onClose={() => setSelected(null)} onChanged={async (message) => { notify(message); const updated = (await api.order(selected.id)).order; setSelected(updated); await load(); }} />}
  </section>;
}

function OrderDetail({ order, user, onClose, onChanged }: { order: Order; user: User; onClose: () => void; onChanged: (message: string) => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState('Техника недоступна на выбранное время');
  const [rollingBack, setRollingBack] = useState(false);
  const [rollbackReason, setRollbackReason] = useState('Статус изменён по ошибке');
  const rollbackDialogRef = useRef<HTMLDivElement>(null);
  const [reviewing, setReviewing] = useState(false);
  const [rating, setRating] = useState(5);
  const [reviewText, setReviewText] = useState('Всё выполнено в срок');
  const [sharingPhone, setSharingPhone] = useState(false);
  const [phone, setPhone] = useState('');
  const customer = user.role === 'CUSTOMER';

  useEffect(() => {
    if (rollingBack) rollbackDialogRef.current?.scrollIntoView({ block: 'nearest' });
  }, [rollingBack]);

  const transition = async (status: OrderStatus, transitionReason?: string) => {
    setBusy(true); setError('');
    try { await api.setStatus(order.id, status, transitionReason); setDeclining(false); await onChanged(`Статус изменён: ${statusLabels[status]}`); }
    catch (err) { setError(messageOf(err)); }
    finally { setBusy(false); }
  };
  const callback = async () => {
    setBusy(true); setError('');
    try { const result = await api.callback(order.id); await onChanged(result.replayed ? 'Запрос на связь уже отправлен' : 'Запрос на связь отправлен'); }
    catch (err) { setError(messageOf(err)); }
    finally { setBusy(false); }
  };
  const acknowledgeCallback = async (sharedPhone?: string) => {
    setBusy(true); setError('');
    try { await api.acknowledgeCallback(order.id, sharedPhone); setSharingPhone(false); await onChanged(sharedPhone ? 'Номер передан собеседнику' : 'Профиль MAX отправлен собеседнику'); }
    catch (err) { setError(messageOf(err)); }
    finally { setBusy(false); }
  };
  const rollback = async () => {
    setBusy(true); setError('');
    try { await api.rollbackStatus(order.id, rollbackReason); setRollingBack(false); await onChanged(`Статус возвращён: ${statusLabels[order.allowedRollback!.target]}`); }
    catch (err) { setError(messageOf(err)); }
    finally { setBusy(false); }
  };
  const review = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError('');
    try { await api.review(order.id, rating, reviewText); setReviewing(false); await onChanged('Спасибо, отзыв сохранён'); }
    catch (err) { setError(messageOf(err)); }
    finally { setBusy(false); }
  };

  return <div className="drawer-backdrop" role="dialog" aria-modal="true"><aside className="drawer"><div className="drawer-head"><div><p className="eyebrow">{order.publicNumber}</p><h2>{order.equipment.title}</h2></div><button className="icon-button" aria-label="Закрыть" onClick={onClose}><X /></button></div>
    <div className={`detail-status ${order.status.toLowerCase()}`}><span>{statusLabels[order.status]}</span><small>{customer ? order.supplier.name : order.customer.name}</small></div>
    <dl className="summary-list"><div><dt><CalendarClock />Дата</dt><dd>{dateTime(order.scheduledAt)}</dd></div><div><dt><MapPin />Место</dt><dd>{order.siteAddress || order.locality}</dd></div><div><dt><Ruler />Объём</dt><dd>{order.workVolume || 'Не указан'}</dd></div><div><dt><Clock3 />Длительность</dt><dd>{order.durationHours} ч</dd></div><div><dt>Смена</dt><dd>{money(order.pricePerShift)}</dd></div></dl>
    <div className="detail-block"><h3>Задача</h3><p>{order.workDescription}</p>{order.constraints && <p className="constraint">Условия: {order.constraints}</p>}{order.siteLatitude !== null && order.siteLongitude !== null && <a className="map-link" href={`https://www.openstreetmap.org/?mlat=${order.siteLatitude}&mlon=${order.siteLongitude}#map=16/${order.siteLatitude}/${order.siteLongitude}`} target="_blank" rel="noreferrer"><Map />Открыть точку на карте</a>}</div>
    {!!order.attachments?.length && <div className="detail-block"><h3>Материалы по объекту</h3><div className="order-attachments">{order.attachments.map((attachment) => <a key={attachment.id} href={attachment.filePath} target="_blank" rel="noreferrer">{attachment.kind === 'PDF' ? <FileText /> : <ImagePlus />}<span>{attachment.fileName}</span><small>{formatBytes(attachment.sizeBytes)}</small></a>)}</div></div>}
    {order.declineReason && <InlineError text={`Причина: ${order.declineReason}`} />}
    {order.events && <div className="timeline"><h3>История статусов</h3>{order.events.map((event, index) => <div key={`${event.toStatus}-${index}`}><span /><p><strong>{statusLabels[event.toStatus]}</strong>{event.note && <em>{event.note}</em>}<small>{dateTime(event.createdAt)}</small></p></div>)}</div>}
    {error && <InlineError text={error} />}
    <div className="drawer-actions">
      {order.incomingCallbackRequestStatus === 'REQUESTED' && <div className="contact-request"><span><PhoneCall />{customer ? 'Поставщик хочет уточнить детали' : 'Заказчик просит связаться'}</span><div className="contact-request-actions"><button className="button secondary" disabled={busy} onClick={() => void acknowledgeCallback()} data-testid="acknowledge-callback"><Check />Поделиться профилем MAX</button><button className="button secondary" disabled={busy} onClick={() => setSharingPhone(true)}><PhoneCall />Поделиться номером</button></div></div>}
      {!customer && order.allowedTransitions?.includes('CONFIRMED') && <button className="button primary" disabled={busy} onClick={() => void transition('CONFIRMED')} data-testid="confirm-status"><Check />Подтвердить</button>}
      {order.canRequestCallback && <button className="button secondary" disabled={busy || order.callbackRequestStatus === 'REQUESTED'} onClick={() => void callback()} data-testid="callback-request"><PhoneCall />{order.callbackRequestStatus === 'REQUESTED' ? 'Запрос на связь отправлен' : customer ? 'Связаться с поставщиком' : 'Связаться с заказчиком'}</button>}
      {!customer && order.allowedTransitions?.includes('DECLINED') && <button className="button danger-text" disabled={busy} onClick={() => setDeclining(true)}>Отклонить</button>}
      {!customer && order.allowedTransitions?.includes('IN_PROGRESS') && <button className="button primary" disabled={busy} onClick={() => void transition('IN_PROGRESS')} data-testid="progress-status">Начать работы</button>}
      {!customer && order.allowedTransitions?.includes('COMPLETED') && <button className="button primary" disabled={busy} onClick={() => void transition('COMPLETED')} data-testid="complete-status"><Check />Завершить</button>}
      {!customer && order.allowedRollback && <button className="button text" disabled={busy} onClick={() => { setDeclining(false); setRollingBack(true); }} data-testid="open-rollback"><RotateCcw />Вернуть статус</button>}
      {customer && order.allowedTransitions?.includes('CANCELLED') && <button className="button danger-text" disabled={busy} onClick={() => void transition('CANCELLED')}>Отменить заявку</button>}
      {customer && order.status === 'COMPLETED' && !order.review && <button className="button primary" onClick={() => setReviewing(true)} data-testid="open-review"><Star />Оставить отзыв</button>}
      {order.review && <div className="saved-review"><span>{'★'.repeat(order.review.rating)}</span><p>{order.review.text}</p></div>}
    </div>
    {declining && <div className="subdialog"><label className="field"><span>Причина отклонения</span><textarea rows={3} value={reason} onChange={(event) => setReason(event.target.value)} /></label><div><button className="button secondary" onClick={() => setDeclining(false)}>Назад</button><button className="button danger" disabled={reason.length < 3 || busy} onClick={() => void transition('DECLINED', reason)}>Отклонить</button></div></div>}
    {rollingBack && order.allowedRollback && <div className="subdialog" ref={rollbackDialogRef}><h3>Вернуть статус «{statusLabels[order.allowedRollback.target]}»?</h3><p className="muted">Заказчик получит уведомление, а изменение останется в истории заявки.</p><label className="field"><span>Причина изменения</span><textarea rows={3} minLength={3} maxLength={500} value={rollbackReason} onChange={(event) => setRollbackReason(event.target.value)} /></label><div><button className="button secondary" onClick={() => setRollingBack(false)}>Назад</button><button className="button primary" disabled={rollbackReason.trim().length < 3 || busy} onClick={() => void rollback()} data-testid="confirm-rollback"><RotateCcw />Вернуть</button></div></div>}
    {reviewing && <form className="subdialog review-form" onSubmit={review}><div className="rating" aria-label="Оценка">{[1,2,3,4,5].map((value) => <button type="button" aria-label={`${value}`} key={value} className={value <= rating ? 'active' : ''} onClick={() => setRating(value)}>★</button>)}</div><label className="field"><span>Короткий отзыв</span><textarea minLength={3} maxLength={500} required rows={3} value={reviewText} onChange={(event) => setReviewText(event.target.value)} data-testid="review-text" /></label><button className="button primary wide" disabled={busy} type="submit" data-testid="submit-review">Сохранить отзыв</button></form>}
    {sharingPhone && <form className="subdialog phone-share" onSubmit={(event) => { event.preventDefault(); void acknowledgeCallback(phone); }}><h3>Передать номер?</h3><p className="muted">Номер увидит только собеседник по этой заявке. Он будет отправлен ему сообщением от бота.</p><label className="field"><span>Номер телефона</span><input required type="tel" inputMode="tel" minLength={7} maxLength={32} autoComplete="tel" placeholder="+7 999 123-45-67" value={phone} onChange={(event) => setPhone(event.target.value)} /></label><label className="phone-consent"><input type="checkbox" required /><span>Я разрешаю передать этот номер собеседнику по заявке {order.publicNumber}.</span></label><div><button type="button" className="button secondary" onClick={() => setSharingPhone(false)}>Отмена</button><button type="submit" className="button primary" disabled={busy || phone.trim().length < 7}><Check />Подтвердить</button></div></form>}
  </aside></div>;
}

function SupplierEquipmentList({ meta, notify }: { meta: Meta; notify: (message: string) => void }) {
  const [items, setItems] = useState<SupplierEquipment[]>([]);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<SupplierEquipment | null>(null);
  const [category, setCategory] = useState<Category>(meta.categories[0]?.value ?? 'MOBILE_CRANE');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [pricePerShift, setPricePerShift] = useState('');
  const [responseMinutes, setResponseMinutes] = useState('45');
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [specifications, setSpecifications] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const specLabels = useMemo(() => specificationFields[category], [category]);

  const load = useCallback(async () => {
    setBusy(true); setError('');
    try { setItems((await api.supplierEquipment()).equipment); }
    catch (err) { setError(messageOf(err)); }
    finally { setBusy(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const resetForm = () => {
    setAdding(false);
    setEditing(null);
    setCategory(meta.categories[0]?.value ?? 'MOBILE_CRANE');
    setTitle('');
    setDescription('');
    setPricePerShift('');
    setResponseMinutes('45');
    setImageDataUrl(null);
    setSpecifications({});
  };

  const openAddForm = () => {
    resetForm();
    setAdding(true);
  };

  const openEditForm = (item: SupplierEquipment) => {
    setAdding(true);
    setEditing(item);
    setCategory(item.category);
    setTitle(item.title);
    setDescription(item.description);
    setPricePerShift(String(item.pricePerShift));
    setResponseMinutes(String(item.responseMinutes));
    setImageDataUrl(null);
    setSpecifications(item.specifications ?? {});
    setError('');
  };

  const saveEquipment = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true); setError('');
    try {
      const cleanedSpecs = Object.fromEntries(Object.entries(specifications).filter(([, value]) => value.trim()).map(([key, value]) => [key, value.trim()]));
      const body = { category, title, description, pricePerShift: Number(pricePerShift), responseMinutes: Number(responseMinutes), specifications: cleanedSpecs, imageDataUrl };
      const result = editing ? await api.updateSupplierEquipment(editing.id, body) : await api.addSupplierEquipment(body);
      setItems((current) => editing ? current.map((item) => item.id === result.equipment.id ? result.equipment : item) : [result.equipment, ...current]);
      resetForm();
      notify(editing ? 'Позиция обновлена' : 'Позиция добавлена в каталог');
    } catch (err) { setError(messageOf(err)); }
    finally { setBusy(false); }
  };

  const chooseCategory = (nextCategory: Category) => {
    setCategory(nextCategory);
    setSpecifications({});
  };

  const chooseImage = async (file: File | undefined) => {
    if (!file) return;
    try { setImageDataUrl(await readImage(file)); setError(''); }
    catch (err) { setError(messageOf(err)); }
  };

  const removeEquipment = async (item: SupplierEquipment) => {
    if (!window.confirm(`Убрать «${item.title}» из каталога? Новые заказчики больше не увидят эту позицию.`)) return;
    setBusy(true); setError('');
    try {
      await api.removeSupplierEquipment(item.id);
      setItems((current) => current.filter((currentItem) => currentItem.id !== item.id));
      notify('Позиция убрана из каталога');
    } catch (err) { setError(messageOf(err)); }
    finally { setBusy(false); }
  };

  const previewImage = imageDataUrl ?? editing?.imagePath ?? '';

  return <section className="page equipment-page"><div className="page-heading row-heading equipment-heading"><div><p className="eyebrow">Поставщик</p><h1>Моя техника</h1><p>Эти позиции видят заказчики при подборе техники.</p></div><button className="button primary" onClick={openAddForm}><Plus />Добавить</button></div>
    {error && <InlineError text={error} />}
    {adding && <form className="form-grid equipment-form" onSubmit={saveEquipment}>
      <label className="field"><span>Категория *</span><select value={category} onChange={(event) => chooseCategory(event.target.value as Category)}>{meta.categories.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
      <label className="field"><span>Название *</span><input required minLength={2} maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Например, автокран 25 т" /></label>
      <label className="field full equipment-photo-field"><span>Фото техники</span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => void chooseImage(event.target.files?.[0])} />{previewImage ? <img src={previewImage} alt="" /> : <small><ImagePlus size={16} />JPG, PNG или WebP до 3 МБ</small>}</label>
      <label className="field full"><span>Описание *</span><textarea required rows={3} minLength={5} maxLength={500} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Ключевые особенности, экипаж, условия работы" /></label>
      {specLabels.map((label) => <label className="field" key={label}><span>{label}</span><input maxLength={120} value={specifications[label] ?? ''} onChange={(event) => setSpecifications((current) => ({ ...current, [label]: event.target.value }))} placeholder={label === 'Дополнительно' ? 'Экипаж, топливо, минимальная смена' : ''} /></label>)}
      <label className="field"><span>Цена за смену, ₽ *</span><input required type="number" min="1000" max="1000000" value={pricePerShift} onChange={(event) => setPricePerShift(event.target.value)} /></label>
      <label className="field"><span>Подача, минут *</span><input required type="number" min="10" max="1440" value={responseMinutes} onChange={(event) => setResponseMinutes(event.target.value)} /></label>
      <div className="equipment-form-actions full"><button className="button secondary" type="button" disabled={busy} onClick={resetForm}>Отмена</button><button className="button primary" disabled={busy} type="submit">{busy ? <LoaderCircle className="spin" /> : editing ? <Pencil /> : <Plus />}{editing ? 'Сохранить изменения' : 'Добавить в каталог'}</button></div>
    </form>}
    {busy && !items.length ? <Spinner label="Загружаем технику" /> : !items.length ? <Empty icon={<Truck />} title="Пока нет позиций" text="Добавьте первую единицу техники, чтобы она стала доступна заказчикам." action={<button className="button primary" onClick={openAddForm}><Plus />Добавить технику</button>} /> : <div className="equipment-list">{items.map((item) => <article key={item.id} className="equipment-row"><img src={item.imagePath} alt="" /><div><p className="eyebrow">{categoryLabels[item.category]}</p><h2>{item.title}</h2><p>{item.description}</p><div className="equipment-facts"><span>{money(item.pricePerShift)} / смена</span><span>Подача ~{item.responseMinutes} мин</span></div>{!!specificationEntries(item.specifications).length && <div className="spec-list compact">{specificationEntries(item.specifications).map(([key, value]) => <span key={key}><b>{key}</b>{value}</span>)}</div>}</div><div className="equipment-row-actions"><button className="icon-button edit-icon" title="Редактировать" aria-label={`Редактировать ${item.title}`} disabled={busy} onClick={() => openEditForm(item)}><Pencil /></button><button className="icon-button danger-icon" title="Убрать из каталога" aria-label={`Убрать ${item.title} из каталога`} disabled={busy} onClick={() => void removeEquipment(item)}><Trash2 /></button></div></article>)}</div>}
  </section>;
}

function SupplierApplication({ meta, notify }: { meta: Meta; notify: (message: string) => void }) {
  const [companyName, setCompanyName] = useState('');
  const [region, setRegion] = useState('Чувашская Республика');
  const [contact, setContact] = useState('');
  const [categories, setCategories] = useState<Category[]>([]);
  const [submitted, setSubmitted] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const toggle = (category: Category) => setCategories((current) => current.includes(category) ? current.filter((item) => item !== category) : [...current, category]);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError('');
    try { const result = await api.supplierApplication({ companyName, region, contact, categories }); setSubmitted(result.application.companyName); notify('Заявка поставщика отправлена'); }
    catch (err) { setError(messageOf(err)); }
    finally { setBusy(false); }
  };
  if (submitted) return <section className="page narrow success-page"><div className="success-icon"><Check /></div><p className="eyebrow">Заявка принята</p><h1>На проверке</h1><p>{submitted} не добавлен в каталог автоматически. Команда пилота свяжется с вами после ручной проверки.</p><button className="button secondary" onClick={() => setSubmitted('')}>Отправить другую</button></section>;
  return <section className="page narrow"><div className="page-heading"><div><p className="eyebrow">Подключение к пилоту</p><h1>Стать поставщиком</h1><p>Оставьте данные компании. Публикация возможна только после ручной проверки.</p></div></div><form className="form-grid" onSubmit={submit}><label className="field full"><span>Компания *</span><input required minLength={2} maxLength={120} value={companyName} onChange={(event) => setCompanyName(event.target.value)} /></label><label className="field full"><span>Регион *</span><input required value={region} onChange={(event) => setRegion(event.target.value)} /></label><label className="field full"><span>Контакт для связи *</span><input required minLength={3} maxLength={160} placeholder="Телефон или email" value={contact} onChange={(event) => setContact(event.target.value)} /></label><fieldset className="category-checks full"><legend>Категории техники *</legend>{meta.categories.map((item) => <label key={item.value}><input type="checkbox" checked={categories.includes(item.value)} onChange={() => toggle(item.value)} /><span>{item.label}</span></label>)}</fieldset>{error && <div className="full"><InlineError text={error} /></div>}<button className="button primary wide full" disabled={busy || !categories.length}>{busy ? <LoaderCircle className="spin" /> : <Send />}Отправить заявку</button></form></section>;
}

function Notifications() {
  const [items, setItems] = useState<Notification[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => { setBusy(true); try { setItems((await api.notifications()).notifications); setError(''); } catch (err) { setError(messageOf(err)); } finally { setBusy(false); } }, []);
  useEffect(() => { void load(); }, [load]);
  return <section className="page narrow"><div className="page-heading row-heading"><div><p className="eyebrow">MAX</p><h1>Уведомления</h1><p>События по заявкам и обратным звонкам.</p></div><button className="icon-button" title="Обновить" onClick={() => void load()}><RefreshCw /></button></div>{error && <InlineError text={error} />}{busy ? <Spinner /> : !items.length ? <Empty icon={<Bell />} title="Уведомлений нет" text="Здесь появятся события по заявкам и обратным звонкам." /> : <div className="notification-list">{items.map((item) => <article key={item.id}><span className="notification-icon"><MessageSquareText /></span><div><p>{item.text}</p><small>{dateTime(item.createdAt)} · {item.status === 'DELIVERED_DRY_RUN' ? 'dry-run' : item.status}</small></div></article>)}</div>}</section>;
}

function Back({ onClick }: { onClick: () => void }) { return <button className="back-button" onClick={onClick}><ArrowLeft />Назад</button>; }
function InlineError({ text }: { text: string }) { return <div className="inline-error" role="alert"><CircleAlert />{text}</div>; }
function messageOf(error: unknown): string { return error instanceof ApiClientError || error instanceof Error ? error.message : 'Не удалось выполнить действие'; }

export default App;
