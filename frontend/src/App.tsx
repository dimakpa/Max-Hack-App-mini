import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  ArrowLeft, Bell, BriefcaseBusiness, Building2, CalendarClock, Check, ChevronRight,
  CircleAlert, Clock3, FileText, HardHat, LoaderCircle, MapPin, MessageSquareText,
  PhoneCall, Plus, RefreshCw, RotateCcw, Send, Sparkles, Star, UserRound, X
} from 'lucide-react';
import { api, ApiClientError, getDemoAlias, setDemoAlias, type DraftFields } from './api';
import { categoryLabels, dateTime, money, statusLabels } from './format';
import type { Category, DemoUser, Draft, Meta, Notification, Order, OrderStatus, Proposal, User } from './types';

type Section = 'new' | 'orders' | 'supplier' | 'notifications';
type Flow = 'start' | 'describe' | 'form' | 'proposals' | 'success';

const demoBuild = import.meta.env.VITE_DEMO_AUTH === 'true';

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

function Empty({ icon, title, text, action }: { icon: ReactNode; title: string; text: string; action?: ReactNode }) {
  return <div className="empty-state"><div className="empty-icon">{icon}</div><h3>{title}</h3><p>{text}</p>{action}</div>;
}

function Spinner({ label = 'Загрузка' }: { label?: string }) {
  return <div className="loading"><LoaderCircle className="spin" size={22} /><span>{label}</span></div>;
}

function App() {
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
      if (demoBuild) setDemoUsers((await api.demoUsers()).users);
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
        <div className="demo-pill"><span className="demo-dot" />Тестовые данные</div>
        <div className="role-box">
          <UserRound size={18} />
          {demoBuild ? <select aria-label="Тестовая роль" data-testid="role-switcher" value={getDemoAlias()} onChange={(event) => void switchRole(event.target.value)}>
            {demoUsers.map((item) => <option key={item.alias} value={item.alias}>{item.name}</option>)}
          </select> : <span>{user.displayName}</span>}
        </div>
      </header>

      <main>
        {section === 'new' && customer && <NewRequest meta={meta} onCreated={() => setSection('orders')} notify={setToast} />}
        {section === 'orders' && <Orders user={user} onNew={() => setSection('new')} notify={setToast} />}
        {section === 'supplier' && customer && <SupplierApplication meta={meta} notify={setToast} />}
        {section === 'notifications' && <Notifications />}
      </main>
    </div>

    <nav className="bottom-nav">{navigation.map((item) => <button key={item.id} className={section === item.id ? 'active' : ''} onClick={() => setSection(item.id)}>{item.icon}<span>{item.id === 'supplier' ? 'Поставщик' : item.label}</span></button>)}</nav>
    {toast && <div role="status" className="toast"><Check size={17} />{toast}</div>}
  </div>;
}

function NewRequest({ meta, onCreated, notify }: { meta: Meta; onCreated: () => void; notify: (message: string) => void }) {
  const [flow, setFlow] = useState<Flow>('start');
  const [text, setText] = useState('Нужен автокран 25 тонн в Чебоксарах завтра к 9:00 на 8 часов, узкий въезд на площадку');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [selected, setSelected] = useState<Proposal | null>(null);
  const [created, setCreated] = useState<Order | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const parse = async () => {
    setBusy(true); setError('');
    try {
      const result = await api.parseDraft(text);
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

  if (flow === 'start') return <section className="page new-page">
    <div className="page-heading"><div><p className="eyebrow">Чувашская Республика</p><h1>Какая техника нужна?</h1><p>Начните с задачи. Экипаж уже включён в каждое предложение.</p></div></div>
    <div className="fleet-visual"><img src="/assets/fleet.png" alt="Синтетический парк спецтехники" /><span>Синтетический демонстрационный каталог</span></div>
    <div className="start-actions">
      <button className="start-option featured" onClick={() => setFlow('describe')} data-testid="describe-start"><span className="option-icon"><Sparkles /></span><span><strong>Описать задачу</strong><small>Помощник подготовит черновик, вы всё проверите</small></span><ChevronRight /></button>
      <button className="start-option" onClick={() => { setDraft(null); setNotice(''); setFlow('form'); }} data-testid="manual-start"><span className="option-icon neutral"><FileText /></span><span><strong>Заполнить вручную</strong><small>Короткая форма без ИИ</small></span><ChevronRight /></button>
    </div>
    <div className="category-strip">{meta.categories.map((category) => <span key={category.value}>{category.label}</span>)}</div>
  </section>;

  if (flow === 'describe') return <section className="page narrow">
    <Back onClick={() => setFlow('start')} />
    <div className="page-heading"><div><p className="eyebrow">Шаг 1 из 3</p><h1>Опишите задачу</h1><p>Укажите технику, место, дату и ограничения обычным текстом.</p></div></div>
    <label className="field"><span>Задача</span><textarea rows={7} value={text} maxLength={2000} onChange={(event) => setText(event.target.value)} data-testid="task-text" /><small>{text.length}/2000</small></label>
    {error && <InlineError text={error} />}
    <div className="sticky-actions"><button className="button primary wide" disabled={busy || text.trim().length < 10} onClick={() => void parse()} data-testid="parse-submit">{busy ? <LoaderCircle className="spin" /> : <Sparkles />}Подготовить черновик</button></div>
  </section>;

  if (flow === 'form') return <DraftForm meta={meta} draft={draft} notice={notice} busy={busy} error={error} onBack={() => setFlow(draft ? 'describe' : 'start')} onSubmit={async (fields) => {
    setBusy(true); setError('');
    try {
      const saved = draft ? await api.updateDraft(draft.id, fields) : await api.createDraft(fields);
      setDraft(saved.draft);
      const result = await api.proposals(saved.draft.id);
      proposalsReady(result.proposals, result.reason);
    } catch (err) { setError(messageOf(err)); }
    finally { setBusy(false); }
  }} />;

  if (flow === 'proposals') return <section className="page proposals-page">
    <Back onClick={() => setFlow('form')} />
    <div className="page-heading row-heading"><div><p className="eyebrow">Шаг 3 из 3</p><h1>Подходящие предложения</h1><p>{proposals.length ? `Найдено ${proposals.length}. Можно выбрать любой вариант.` : 'Измените параметры и попробуйте снова.'}</p></div></div>
    {!proposals.length ? <Empty icon={<HardHat />} title="Подходящих вариантов нет" text={error || 'На выбранное время свободной техники нет.'} action={<button className="button secondary" onClick={() => setFlow('form')}>Изменить параметры</button>} /> : <div className="proposal-list">{proposals.map((item, index) => <article className="proposal" key={item.id}>
      <div className="proposal-image"><img src={item.imagePath} alt={item.title} /><span>#{index + 1}</span></div>
      <div className="proposal-body"><div className="proposal-title"><div><p className="supplier-name">{item.supplier.name}</p><h2>{item.title}</h2></div><strong className="price">{money(item.pricePerShift)}<small>/ смена</small></strong></div>
        <div className="facts"><span><Clock3 />Подача ~{item.responseMinutes} мин</span><span><Star className="star" />{item.supplier.rating} · {item.supplier.reviewCount} отзывов</span></div>
        <p className="why"><Check />{item.explanation}</p>
        <button className="button primary" onClick={() => setSelected(item)} data-testid={`select-proposal-${index}`}>Выбрать предложение</button>
      </div>
    </article>)}</div>}
    {selected && <ConfirmDialog proposal={selected} draft={draft!} busy={busy} error={error} onClose={() => setSelected(null)} onConfirm={() => void createOrder()} />}
  </section>;

  return <section className="page narrow success-page"><div className="success-icon"><Check /></div><p className="eyebrow">Заявка отправлена</p><h1>{created?.publicNumber}</h1><p>Поставщик получил уведомление. Статус появится в разделе заявок.</p><div className="success-summary"><span>{created?.equipment.title}</span><strong>{created && money(created.pricePerShift)}</strong></div><button className="button primary wide" onClick={onCreated}>Открыть мои заявки</button><button className="button text" onClick={() => { setFlow('start'); setCreated(null); setDraft(null); }}>Создать ещё одну</button></section>;
}

function DraftForm({ meta, draft, notice, busy, error, onBack, onSubmit }: { meta: Meta; draft: Draft | null; notice: string; busy: boolean; error: string; onBack: () => void; onSubmit: (fields: DraftFields) => Promise<void> }) {
  const [category, setCategory] = useState(draft?.category ?? '');
  const [scheduledAt, setScheduledAt] = useState(draft ? toLocalInput(draft.scheduledAt) : tomorrowLocal());
  const [duration, setDuration] = useState(String(draft?.durationHours ?? 8));
  const [locality, setLocality] = useState(draft?.locality ?? 'Чебоксары');
  const [description, setDescription] = useState(draft?.workDescription ?? '');
  const [constraints, setConstraints] = useState(draft?.constraints ?? '');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void onSubmit({ category, scheduledAt: new Date(scheduledAt).toISOString(), durationHours: Number(duration), locality, workDescription: description, constraints: constraints || null });
  };

  return <section className="page narrow"><Back onClick={onBack} /><div className="page-heading"><div><p className="eyebrow">Шаг 2 из 3</p><h1>Проверьте заявку</h1><p>Поля можно изменить. Ничего не бронируется без вашего выбора.</p></div></div>
    {notice && <div className="notice"><Sparkles size={18} /><span>{notice}</span></div>}
    <form className="form-grid" onSubmit={submit} data-testid="draft-form">
      <label className="field full"><span>Категория техники *</span><select required value={category} onChange={(event) => setCategory(event.target.value)} data-testid="category"><option value="">Выберите категорию</option>{meta.categories.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
      <label className="field"><span>Дата и время *</span><input type="datetime-local" required value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} data-testid="scheduled-at" /></label>
      <label className="field"><span>Длительность, часов *</span><input type="number" min="1" max="168" required value={duration} onChange={(event) => setDuration(event.target.value)} data-testid="duration" /></label>
      <label className="field full"><span>Населённый пункт *</span><input list="localities" required minLength={2} value={locality} onChange={(event) => setLocality(event.target.value)} data-testid="locality" /><datalist id="localities">{meta.localities.map((item) => <option key={item}>{item}</option>)}</datalist></label>
      <label className="field full"><span>Что нужно сделать *</span><textarea rows={4} required minLength={10} maxLength={1000} value={description} onChange={(event) => setDescription(event.target.value)} data-testid="work-description" /></label>
      <label className="field full"><span>Ограничения</span><textarea rows={3} maxLength={500} placeholder="Например: узкий въезд, высота, тип грунта" value={constraints} onChange={(event) => setConstraints(event.target.value)} /></label>
      {error && <div className="full"><InlineError text={error} /></div>}
      <div className="sticky-actions full"><button className="button primary wide" disabled={busy} type="submit" data-testid="find-proposals">{busy ? <LoaderCircle className="spin" /> : <HardHat />}Найти предложения</button></div>
    </form>
  </section>;
}

function ConfirmDialog({ proposal, draft, busy, error, onClose, onConfirm }: { proposal: Proposal; draft: Draft; busy: boolean; error: string; onClose: () => void; onConfirm: () => void }) {
  return <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="confirm-title"><div className="modal">
    <button className="icon-button modal-close" aria-label="Закрыть" onClick={onClose}><X /></button><p className="eyebrow">Подтверждение</p><h2 id="confirm-title">Отправить заявку?</h2>
    <div className="confirm-equipment"><img src={proposal.imagePath} alt="" /><div><strong>{proposal.title}</strong><span>{proposal.supplier.name}</span></div></div>
    <dl className="summary-list"><div><dt><CalendarClock />Дата</dt><dd>{draft.scheduledAt && dateTime(draft.scheduledAt)}</dd></div><div><dt><MapPin />Место</dt><dd>{draft.locality}</dd></div><div><dt><Clock3 />Длительность</dt><dd>{draft.durationHours} ч</dd></div><div><dt>Стоимость смены</dt><dd>{money(proposal.pricePerShift)}</dd></div></dl>
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
  const acknowledgeCallback = async () => {
    setBusy(true); setError('');
    try { await api.acknowledgeCallback(order.id); await onChanged('Связь подтверждена'); }
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
    <dl className="summary-list"><div><dt><CalendarClock />Дата</dt><dd>{dateTime(order.scheduledAt)}</dd></div><div><dt><MapPin />Место</dt><dd>{order.locality}</dd></div><div><dt><Clock3 />Длительность</dt><dd>{order.durationHours} ч</dd></div><div><dt>Смена</dt><dd>{money(order.pricePerShift)}</dd></div></dl>
    <div className="detail-block"><h3>Задача</h3><p>{order.workDescription}</p>{order.constraints && <p className="constraint">Ограничение: {order.constraints}</p>}</div>
    {order.declineReason && <InlineError text={`Причина: ${order.declineReason}`} />}
    {order.events && <div className="timeline"><h3>История статусов</h3>{order.events.map((event, index) => <div key={`${event.toStatus}-${index}`}><span /><p><strong>{statusLabels[event.toStatus]}</strong>{event.note && <em>{event.note}</em>}<small>{dateTime(event.createdAt)}</small></p></div>)}</div>}
    {error && <InlineError text={error} />}
    <div className="drawer-actions">
      {order.incomingCallbackRequestStatus === 'REQUESTED' && <div className="contact-request"><span><PhoneCall />{customer ? 'Поставщик хочет уточнить детали' : 'Заказчик просит связаться'}</span><button className="button secondary" disabled={busy} onClick={() => void acknowledgeCallback()} data-testid="acknowledge-callback"><Check />Уже связались</button></div>}
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
  </aside></div>;
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
  return <section className="page narrow"><div className="page-heading row-heading"><div><p className="eyebrow">Bot adapter</p><h1>Уведомления</h1><p>В demo-режиме доставка записывается как dry-run.</p></div><button className="icon-button" title="Обновить" onClick={() => void load()}><RefreshCw /></button></div>{error && <InlineError text={error} />}{busy ? <Spinner /> : !items.length ? <Empty icon={<Bell />} title="Уведомлений нет" text="Здесь появятся события по заявкам и обратным звонкам." /> : <div className="notification-list">{items.map((item) => <article key={item.id}><span className="notification-icon"><MessageSquareText /></span><div><p>{item.text}</p><small>{dateTime(item.createdAt)} · {item.status === 'DELIVERED_DRY_RUN' ? 'dry-run' : item.status}</small></div></article>)}</div>}</section>;
}

function Back({ onClick }: { onClick: () => void }) { return <button className="back-button" onClick={onClick}><ArrowLeft />Назад</button>; }
function InlineError({ text }: { text: string }) { return <div className="inline-error" role="alert"><CircleAlert />{text}</div>; }
function messageOf(error: unknown): string { return error instanceof ApiClientError || error instanceof Error ? error.message : 'Не удалось выполнить действие'; }

export default App;
