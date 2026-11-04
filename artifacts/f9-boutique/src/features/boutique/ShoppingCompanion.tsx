import { useRef, useState } from 'react';
import { ArrowDownUp, ArrowLeft, ArrowRight, RefreshCw, Send, Sparkles } from 'lucide-react';
import { getGetExchangeRatesQueryKey, useAskStylist, useGetExchangeRates } from '@workspace/api-client-react';
import type { StylistMessage } from '@workspace/api-client-react';
import './_companion.css';

type Language = 'en' | 'ar';
type ChatMessage = StylistMessage;

const copy = {
  en: {
    eyebrow: 'A MORE PERSONAL WAY TO SHOP', title: 'Your Shopping Companion',
    intro: 'A considered little corner for thoughtful conversions and a second opinion on style.',
    rates: 'Currency, considered', ratesIntro: 'Daily reference rates, with KWD as the base.',
    amount: 'Amount', from: 'From', to: 'To', swap: 'Swap currencies',
    indicative: 'Indicative conversion only. No fees are included; original boutique prices remain unchanged.',
    source: 'Rate source', updated: 'Last updated', next: 'Next expected update',
    refresh: 'Refresh rates', loading: 'Gathering the latest reference rates…',
    retry: 'Try again', unavailable: 'Rates are unavailable right now. Please try again.',
    stylist: 'Ask the F9 stylist', stylistIntro: 'A thoughtful perspective on the pieces, colors and occasions you have in mind.',
    prompt: 'Suggest an elegant abaya for a daytime gathering', explain: 'Explain today’s exchange rates',
    placeholder: 'Tell me what you’re looking for…', send: 'Send question', sending: 'The stylist is considering your question…',
    disclaimer: 'Questions are sent to OpenRouter. Replies are AI-generated and are not order support.',
    errorGeneric: 'We could not reach the stylist. Your question is here; please retry.',
    config: 'The stylist is not connected yet. The site owner needs to add the OpenRouter API key securely.',
    configDetails: 'The stylist’s API key needs attention. Please contact the site owner.',
    credits: 'The stylist is unavailable because its provider credits need attention. Please contact the site owner.',
    limited: 'There have been too many requests. Please wait a moment and try again.',
    enter: 'Write a question first.', rateUnknown: 'This currency is not available in the latest rate table.',
    conversion: 'Estimated amount', reference: 'Reference rates', latest: 'Latest rates · 1 KWD', noRate: 'No rate data is available.',
    amountInvalid: 'Enter a valid amount from 0 to 1,000,000,000,000.',
    back: 'Back to F9', sourceLink: 'ExchangeRate-API',
  },
  ar: {
    eyebrow: 'تجربة تسوّق أقرب إليك', title: 'رفيقتك في التسوّق',
    intro: 'مساحة هادئة للتحويلات التقديرية ورأي إضافي في إطلالتك.',
    rates: 'تحويل العملات', ratesIntro: 'أسعار مرجعية يومية، والدينار الكويتي هو الأساس.',
    amount: 'المبلغ', from: 'من', to: 'إلى', swap: 'تبديل العملات',
    indicative: 'تحويل إرشادي فقط، دون رسوم. تبقى أسعار البوتيك الأصلية كما هي.',
    source: 'مصدر الأسعار', updated: 'آخر تحديث', next: 'التحديث المتوقع',
    refresh: 'تحديث الأسعار', loading: 'جارٍ جلب أحدث الأسعار المرجعية…',
    retry: 'إعادة المحاولة', unavailable: 'الأسعار غير متاحة حالياً. يرجى المحاولة مجدداً.',
    stylist: 'اسألي منسقة F9', stylistIntro: 'رأي مدروس حول القطع والألوان والمناسبات التي تفكرين بها.',
    prompt: 'اقترحي عباية أنيقة للقاء نهاري', explain: 'اشرحي أسعار الصرف اليوم',
    placeholder: 'أخبريني عما تبحثين عنه…', send: 'إرسال السؤال', sending: 'تتأمل المنسقة سؤالك…',
    disclaimer: 'تُرسل الأسئلة إلى OpenRouter. الردود مولّدة بالذكاء الاصطناعي وليست دعماً للطلبات.',
    errorGeneric: 'تعذر الوصول إلى المنسقة. سؤالك محفوظ هنا؛ أعيدي المحاولة.',
    config: 'المنسقة غير متصلة بعد. يجب على مالكة الموقع إضافة مفتاح OpenRouter بشكل آمن.',
    configDetails: 'يحتاج مفتاح خدمة التنسيق إلى مراجعة. يرجى التواصل مع مالكة الموقع.',
    credits: 'الخدمة غير متاحة لأن رصيد مزود الذكاء الاصطناعي يحتاج إلى مراجعة. يرجى التواصل مع مالكة الموقع.',
    limited: 'توجد طلبات كثيرة الآن. انتظري قليلاً ثم حاولي مجدداً.',
    enter: 'اكتبي سؤالك أولاً.', rateUnknown: 'هذه العملة غير متاحة في أحدث جدول للأسعار.',
    conversion: 'المبلغ التقديري', reference: 'الأسعار المرجعية', latest: 'أحدث الأسعار · ١ د.ك', noRate: 'لا تتوفر بيانات للأسعار.',
    amountInvalid: 'أدخلي مبلغاً صحيحاً من ٠ إلى ١٬٠٠٠٬٠٠٠٬٠٠٠٬٠٠٠.',
    back: 'العودة إلى F9', sourceLink: 'إكستشينج ريت API',
  },
} as const;

function formatDate(value: string, language: Language) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(language === 'ar' ? 'ar-KW' : 'en-KW', {
    dateStyle: 'medium', timeStyle: 'short',
  }).format(date);
}

function friendlyError(error: unknown, language: Language) {
  const text = copy[language];
  const apiError = error && typeof error === 'object' ? error as { data?: unknown; status?: unknown } : {};
  const data = apiError.data && typeof apiError.data === 'object' ? apiError.data as { code?: unknown } : {};
  switch (data.code) {
    case 'AI_NOT_CONFIGURED': return text.config;
    case 'AI_CONFIGURATION': return text.configDetails;
    case 'AI_CREDITS': return text.credits;
    case 'RATE_LIMITED': return text.limited;
    default: if (apiError.status === 429) return text.limited;
  }
  return text.errorGeneric;
}

export function ShoppingCompanion({ language, onBack }: { language: Language; onBack: () => void }) {
  const ar = language === 'ar';
  const text = copy[language];
  const ratesQuery = useGetExchangeRates({ query: { enabled: true, queryKey: getGetExchangeRatesQueryKey(), refetchOnMount: 'always' } });
  const stylist = useAskStylist();
  const [amount, setAmount] = useState('1');
  const [from, setFrom] = useState('KWD');
  const [to, setTo] = useState('USD');
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [failedQuestion, setFailedQuestion] = useState<string | null>(null);
  const [chatError, setChatError] = useState('');
  const [localError, setLocalError] = useState('');
  const submitGuard = useRef(false);
  const refreshGuard = useRef(false);
  const [refreshing, setRefreshing] = useState(false);
  const ratesBusy = ratesQuery.isFetching || refreshing;
  const refreshRates = async () => {
    if (refreshGuard.current || ratesQuery.isFetching) return;
    refreshGuard.current = true;
    setRefreshing(true);
    try { await ratesQuery.refetch({ cancelRefetch: false }); }
    finally { refreshGuard.current = false; setRefreshing(false); }
  };
  const rates = ratesQuery.data?.rates;
  const parsedAmount = amount.trim() === '' ? NaN : Number(amount);
  const validAmount = Number.isFinite(parsedAmount) && parsedAmount >= 0 && parsedAmount <= 1e12;
  const calculated = rates && validAmount && rates[from] > 0 && rates[to] > 0
    ? (parsedAmount / rates[from]) * rates[to] : null;
  const currencyOptions = rates
    ? ['KWD', ...Object.keys(rates).filter(currency => currency !== 'KWD').sort()]
    : ['KWD', 'USD', 'EUR', 'GBP'];

  const send = async (questionOverride?: string) => {
    if (submitGuard.current || stylist.isPending) return;
    const question = questionOverride !== undefined ? questionOverride.trim() : (failedQuestion ?? input).trim();
    if (!question) { setLocalError(text.enter); return; }
    if (question.length > 2000) return;
    submitGuard.current = true;
    setLocalError('');
    setChatError('');
    setFailedQuestion(question);

    const requestMessages: ChatMessage[] = [...messages, { role: 'user' as const, content: question }]
      .map(message => ({ ...message, content: message.content.slice(0, 2000) }));
    while (requestMessages.length > 12 ||
      requestMessages.reduce((total, message) => total + message.content.length, 0) > 12000) {
      if (requestMessages.length <= 1) break;
      requestMessages.splice(0, requestMessages.length > 1 && requestMessages[0].role === 'user' ? 2 : 1);
    }
    try {
      const result = await stylist.mutateAsync({ data: { messages: requestMessages, language } });
      const next = [...requestMessages, { role: 'assistant' as const, content: result.reply }];
      const trimmed = next.slice(-12);
      setMessages(trimmed);
      setFailedQuestion(null);
      setInput('');
    } catch (error) {
      setChatError(friendlyError(error, language));
    } finally {
      submitGuard.current = false;
    }
  };

  const setPrompt = (prompt: string) => {
    setInput(prompt);
    setLocalError('');
  };

  return <section className="f9-companion" aria-labelledby="companion-title">
    <div className="companion-topline">
      <button className="companion-back" onClick={onBack}><ArrowLeft aria-hidden="true"/>{text.back}</button>
      <span className="eyebrow">F9 BOUTIQUE</span>
    </div>
    <header className="companion-heading">
      <span className="eyebrow">{text.eyebrow}</span>
      <h1 id="companion-title">{text.title}</h1>
      <p>{text.intro}</p>
    </header>
    <div className="companion-layout">
      <section className="companion-card currency-card" aria-labelledby="currency-heading">
        <div className="companion-card-head"><span className="companion-mark"><ArrowDownUp/></span><div><span className="eyebrow">{text.reference}</span><h2 id="currency-heading">{text.rates}</h2></div></div>
        <p className="companion-intro">{text.ratesIntro}</p>
        {ratesQuery.isLoading || ratesBusy ? <div className="companion-loading" role="status"><span className="companion-skeleton"/><span>{text.loading}</span></div>
          : ratesQuery.isError || !ratesQuery.data ? <div className="companion-error" role="alert"><p>{text.unavailable}</p><button className="companion-secondary" onClick={() => void refreshRates()} disabled={ratesBusy}>{text.retry}</button></div>
            : <div className="currency-body">
              <label className="companion-field">{text.amount}<input data-testid="input-conversion-amount" type="number" min="0" max="1000000000000" step="any" inputMode="decimal" value={amount} onChange={event => setAmount(event.target.value)} aria-invalid={!validAmount}/></label>
              <div className="currency-pair">
                <label className="companion-field">{text.from}<select data-testid="select-currency-from" value={from} onChange={event => setFrom(event.target.value)}>{currencyOptions.map(currency=><option key={currency}>{currency}</option>)}</select></label>
                <button className="currency-swap" onClick={() => {setFrom(to);setTo(from)}} aria-label={text.swap}><ArrowDownUp/></button>
                <label className="companion-field">{text.to}<select data-testid="select-currency-to" value={to} onChange={event => setTo(event.target.value)}>{currencyOptions.map(currency=><option key={currency}>{currency}</option>)}</select></label>
              </div>
              <div className="conversion-result" aria-live="polite"><span>{text.conversion}</span><strong>{validAmount && calculated !== null ? `${calculated.toLocaleString(ar?'ar-KW':'en-KW',{maximumFractionDigits:3})} ${to}` : !validAmount ? text.amountInvalid : text.noRate}</strong><small>{validAmount && calculated === null ? text.rateUnknown : ''}</small></div>
              <p className="conversion-note">{text.indicative}</p>
              <div className="latest-rates"><span>{text.latest}</span><div>{['USD','EUR','GBP','SAR','AED'].filter(currency=>typeof rates?.[currency]==='number').map(currency=><span key={currency}><b>{currency}</b>{rates?.[currency]?.toLocaleString(ar?'ar-KW':'en-KW',{maximumFractionDigits:4})}</span>)}</div></div>
              <div className="rates-meta">
                <a href="https://www.exchangerate-api.com" target="_blank" rel="noreferrer">{text.source}: {ratesQuery.data.provider || text.sourceLink}</a>
                <span>{text.updated}: {formatDate(ratesQuery.data.updatedAt, language)}</span>
                <span>{text.next}: {formatDate(ratesQuery.data.nextUpdateAt, language)}</span>
              </div>
              <button className="companion-refresh" onClick={() => void refreshRates()} disabled={ratesBusy} aria-busy={ratesBusy}><RefreshCw className={ratesBusy?'is-spinning':''}/>{text.refresh}</button>
            </div>}
      </section>

      <section className="companion-card stylist-card" aria-labelledby="stylist-heading">
        <div className="companion-card-head"><span className="companion-mark"><Sparkles/></span><div><span className="eyebrow">F9 / PERSONAL EDIT</span><h2 id="stylist-heading">{text.stylist}</h2></div></div>
        <p className="companion-intro">{text.stylistIntro}</p>
        <div className="stylist-thread" aria-live="polite" aria-relevant="additions text">
          {messages.length === 0 && failedQuestion === null && <div className="stylist-welcome"><Sparkles/><p>{ar?'لنبدأ من المناسبة أو الأسلوب الذي تحبينه.':'Begin with an occasion, a silhouette or a feeling you have in mind.'}</p></div>}
          {messages.map((message,index)=><div className={`stylist-message ${message.role}`} key={`${message.role}-${index}`}><span>{message.role==='user'?(ar?'أنتِ':'You'):'F9 Stylist'}</span><p>{message.content}</p></div>)}
          {failedQuestion !== null && !messages.some((message,index)=>message.role==='user' && index===messages.length-1 && message.content===failedQuestion) && <div className="stylist-message user"><span>{ar?'أنتِ':'You'}</span><p>{failedQuestion}</p></div>}
          {stylist.isPending && <div className="stylist-pending" role="status"><span className="companion-skeleton"/>{text.sending}</div>}
          {chatError && <div className="stylist-error" role="alert"><p>{chatError}</p><button onClick={() => void send()} disabled={stylist.isPending}>{text.retry}</button></div>}
        </div>
        <div className="stylist-prompts"><button onClick={() => void send(text.prompt)} disabled={stylist.isPending}>{text.prompt}</button><button onClick={() => void send(text.explain)} disabled={stylist.isPending}>{text.explain}</button></div>
        <form className="stylist-form" onSubmit={event=>{event.preventDefault();void send()}}>
          <label className="visually-hidden" htmlFor="stylist-question">{text.placeholder}</label>
          <textarea id="stylist-question" data-testid="input-stylist-question" rows={2} maxLength={2000} value={input} onChange={event=>{setInput(event.target.value);setFailedQuestion(null);setChatError('');setLocalError('')}} placeholder={text.placeholder} disabled={stylist.isPending}/>
          <button className="companion-send" type="submit" disabled={stylist.isPending || (!input.trim() && failedQuestion===null)} aria-label={text.send}><Send/><span>{text.send}</span></button>
        </form>
        {localError && <p className="stylist-local-error" role="alert">{localError}</p>}
        <p className="stylist-disclaimer">{text.disclaimer}</p>
      </section>
    </div>
  </section>;
}
