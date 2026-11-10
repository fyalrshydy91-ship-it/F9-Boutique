import {useEffect,useRef,useState,type Dispatch,type FormEvent,type SetStateAction} from 'react';
import type {Catalog} from '@workspace/api-client-react';
import type {Session as AuthSession,User as AuthUser} from '@supabase/supabase-js';
import {ArrowRight,ArrowUpRight,Check,ChevronRight,Heart,Menu,Minus,Plus,Search,ShoppingBag,SlidersHorizontal,Sparkles,User,X,Scale,MapPin,PackageCheck,MessageCircle} from 'lucide-react';
import {getGetExchangeRatesQueryKey,useGetExchangeRates} from '@workspace/api-client-react';
import {image,blankFilters,type Product,type BagItem,type Filters} from './_data';
import {useStore} from './_use-store';
import {ProductGallery} from './_Gallery';
import {ShoppingCompanion} from './ShoppingCompanion';
import {supabase,type OrderItemSnapshot,type OrderRecord,type OrderStatus,type SupabaseJson} from './supabase-client';
import './_style.css';
import './_responsive.css';

type Page='home'|'abayas'|'women'|'new'|'boutiques'|'collection'|'product'|'favorites'|'bag'|'account'|'orders'|'search'|'compare'|'about'|'contact'|'privacy'|'terms'|'instagram'|'companion';
// Password recovery must leave private Replit previews and return to the public storefront.
const PASSWORD_RESET_REDIRECT_URL='https://luxury-model-designs.replit.app/?f9_recovery=1';
const APPROXIMATE_CURRENCIES=['USD','EUR','GBP','SAR'] as const;
type PasswordRecoveryUrlState='recovery'|'invalid'|null;
type PaymentReturn=
 |{kind:'success';sessionId:string}
 |{kind:'cancel';orderId:string|null}
 |null;
type PaymentNotice={kind:'success'|'error'|'cancel'|'pending';message:string};
type OrderListRecord=Pick<OrderRecord,'id'|'order_number'|'status'|'total'|'currency'|'payment_status'|'items'|'created_at'>;
const isUuid=(value:unknown):value is string=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
function getPasswordRecoveryUrlState():PasswordRecoveryUrlState{
 if(typeof window==='undefined')return null;
 const query=new URLSearchParams(window.location.search);
 const fragment=new URLSearchParams(window.location.hash.replace(/^#/,''));
 const params=[query,fragment];
 const get=(key:string)=>params.map(value=>value.get(key)||'').join(' ').trim().toLowerCase();
 const type=get('type');
 const recoveryMarker=get('f9_recovery')==='1';
 const isRecovery=type.split(/\s+/).includes('recovery')||recoveryMarker;
 const error=get('error');
 const errorCode=get('error_code');
 const description=get('error_description');
 if(isRecovery&&(errorCode.startsWith('otp_')||errorCode.includes('flow_state')||errorCode==='invalid_grant'||error==='access_denied'||/email link|expired|invalid|already used|recovery|otp/i.test(`${error} ${description}`)))return 'invalid';
 return isRecovery?'recovery':null;
}
function getPaymentReturnFromUrl():PaymentReturn{
 if(typeof window==='undefined')return null;
 const query=new URLSearchParams(window.location.search);
 const payment=query.get('payment');
 if(payment==='success')return {kind:'success',sessionId:query.get('session_id')??''};
 if(payment==='cancel')return {kind:'cancel',orderId:isUuid(query.get('order_id'))?query.get('order_id'):null};
 return null;
}
function clearPaymentReturnFromUrl(){
 if(typeof window==='undefined')return;
 const url=new URL(window.location.href);
 for(const key of ['payment','session_id','order_id'])url.searchParams.delete(key);
 window.history.replaceState(window.history.state,document.title,`${url.pathname}${url.search}`);
}
function readCreatedOrderId(value:unknown):string|null{
 if(!value||typeof value!=='object'||Array.isArray(value))return null;
 const id=(value as {id?:unknown}).id;
 return isUuid(id)?id:null;
}
function clearSupabaseAuthCallbackFromUrl(){
 if(typeof window==='undefined')return;
 const url=new URL(window.location.href);
 for(const key of ['access_token','refresh_token','expires_in','expires_at','token_type','type','error','error_code','error_description','code','state','token_hash','provider_token','provider_refresh_token','f9_recovery'])url.searchParams.delete(key);
 url.hash='';
 window.history.replaceState(window.history.state,document.title,`${url.pathname}${url.search}`);
}
function isPasswordRecoveryFailure(error:unknown){
 const item=error&&typeof error==='object'?error as {message?:string;code?:string}:{};
 return /otp_|flow_state|invalid.*(token|grant|otp)|expired|already.?used|auth session missing|refresh token.*(invalid|expired)|email link/i.test(`${item.code??''} ${item.message??''}`.toLowerCase());
}
function isOrderItemSnapshot(value:unknown):value is OrderItemSnapshot{
 if(!value||typeof value!=='object')return false;
 const item=value as Partial<OrderItemSnapshot>;
 return Number.isInteger(item.product_id)&&typeof item.product_name==='string'&&typeof item.product_name_ar==='string'
  &&typeof item.boutique_name==='string'&&typeof item.boutique_name_ar==='string'&&typeof item.image==='string'
  &&typeof item.size==='string'&&typeof item.color==='string'&&typeof item.color_ar==='string'
  &&Number.isInteger(item.quantity)&&Number(item.quantity)>0&&Number.isFinite(item.unit_price)&&Number.isFinite(item.line_total);
}
function readOrderItems(value:unknown):OrderItemSnapshot[]{
 return Array.isArray(value)?value.filter(isOrderItemSnapshot):[];
}
export function Boutique({products,boutiques,lang,setLang}:Catalog & {lang:'en'|'ar';setLang:Dispatch<SetStateAction<'en'|'ar'>>}){
 const [initialRecoveryUrlState]=useState<PasswordRecoveryUrlState>(getPasswordRecoveryUrlState);
  const [paymentReturn,setPaymentReturn]=useState<PaymentReturn>(getPaymentReturnFromUrl);
 const [guestFavorites,setGuestFavorites]=useStore<number[]>('f9-favorites',[]);
 const [favorites,setFavorites]=useState<number[]>([]);
 const [bag,setBag]=useStore<BagItem[]>('f9-bag',[]);
 const [page,setPage]=useState<Page>(()=>initialRecoveryUrlState?'account':'home');
  const productRatesQuery=useGetExchangeRates({query:{enabled:page==='product',queryKey:getGetExchangeRatesQueryKey(),staleTime:0,refetchOnMount:'always',refetchOnWindowFocus:true}});
 const [selected,setSelected]=useState(1);
 const [brand,setBrand]=useState(1);
 const [size,setSize]=useState('');
 const [color,setColor]=useState('');
 const [menu,setMenu]=useState(false);
 const [search,setSearch]=useState('');
 const [showFilters,setShowFilters]=useState(false);
 const [draft,setDraft]=useState<Filters>({...blankFilters});
 const [filters,setFilters]=useState<Filters>({...blankFilters});
 const [sort,setSort]=useState('curated');
 const [savedCompare,setCompare]=useState<number[]>([]);
 const compare=savedCompare.filter(id=>products.some(p=>p.id===id));
 const [tab,setTab]=useState('featured');
 const [auth,setAuth]=useState(()=>initialRecoveryUrlState==='invalid'?'forgot':'login');
 const [authUser,setAuthUser]=useState<AuthUser|null>(null);
  const [authSession,setAuthSession]=useState<AuthSession|null>(null);
 const [authReady,setAuthReady]=useState(false);
 const [authBusy,setAuthBusy]=useState(false);
 const [authError,setAuthError]=useState('');
 const [authNotice,setAuthNotice]=useState('');
 const [accountEmail,setAccountEmail]=useState('');
 const [accountName,setAccountName]=useState('');
 const [accountPassword,setAccountPassword]=useState('');
 const [recoveryConfirmPassword,setRecoveryConfirmPassword]=useState('');
 const [showRecoveryPasswords,setShowRecoveryPasswords]=useState(false);
 const [recoveryMode,setRecoveryMode]=useState(()=>initialRecoveryUrlState==='recovery');
 const [recoveryLinkInvalid,setRecoveryLinkInvalid]=useState(()=>initialRecoveryUrlState==='invalid');
 const [favoriteLoading,setFavoriteLoading]=useState(false);
 const [favoriteLoadError,setFavoriteLoadError]=useState(false);
 const [favoriteBusyIds,setFavoriteBusyIds]=useState<number[]>([]);
   const [orders,setOrders]=useState<OrderListRecord[]>([]);
  const [ordersLoading,setOrdersLoading]=useState(false);
  const [ordersLoaded,setOrdersLoaded]=useState(false);
  const [ordersError,setOrdersError]=useState('');
  const [ordersRetry,setOrdersRetry]=useState(0);
   const [orderSubmitting,setOrderSubmitting]=useState(false);
   const [orderSubmitError,setOrderSubmitError]=useState('');
  const [pendingPaymentOrderId,setPendingPaymentOrderId]=useState<string|null>(()=>{
   const paymentReturn=getPaymentReturnFromUrl();
   return paymentReturn?.kind==='cancel'?paymentReturn.orderId:null;
  });
  const [paymentNotice,setPaymentNotice]=useState<PaymentNotice|null>(null);
  const [paymentVerifying,setPaymentVerifying]=useState(false);
  const [paymentVerificationRetry,setPaymentVerificationRetry]=useState(0);
 const guestFavoritesRef=useRef(guestFavorites);
 const favoriteRequestIds=useRef(new Set<number>());
  const ordersRequestId=useRef(0);
   const orderSubmittingRef=useRef(false);
  const paymentVerificationStarted=useRef(false);
  const recoveryEventSeen=useRef(false);
 const [dialog,setDialog]=useState<'checkout'|'size'|'demo'|null>(null);
 const [toast,setToast]=useState('');
 const toastTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
 const ar=lang==='ar';
 const t=(en:string,arabic:string)=>ar?arabic:en;
 const friendlyAuthError=(error:unknown)=>{
  const item=error&&typeof error==='object'?error as {message?:string;code?:string;status?:number}:{};
  const message=`${item.code??''} ${item.message??''}`.toLowerCase();
  if(message.includes('invalid login')||message.includes('invalid_credentials'))return t('That email and password do not match. Try again.','البريد الإلكتروني أو كلمة المرور غير صحيحة. حاولي مجدداً.');
  if(message.includes('already registered')||message.includes('user_already_exists'))return t('We could not create that account. If you already have one, log in instead.','تعذر إنشاء الحساب. إذا كان لديك حساب، سجّلي الدخول بدلاً من ذلك.');
  if(message.includes('weak_password')||message.includes('password should'))return t('Choose a stronger password with at least 8 characters.','اختاري كلمة مرور أقوى من ٨ أحرف على الأقل.');
  if(message.includes('invalid email')||message.includes('email_address_invalid'))return t('Enter a valid email address.','أدخلي بريداً إلكترونياً صالحاً.');
  if(message.includes('rate limit')||message.includes('too many requests')||item.status===429)return t('Too many attempts. Wait a moment and try again.','محاولات كثيرة. انتظري قليلاً ثم حاولي مجدداً.');
  if(message.includes('signup is disabled')||message.includes('signups not allowed'))return t('New accounts are not available right now. Please try later.','إنشاء الحسابات غير متاح الآن. حاولي لاحقاً.');
  if(message.includes('fetch')||message.includes('network')||message.includes('failed to fetch'))return t('We could not reach the account service. Check your connection and retry.','تعذر الاتصال بخدمة الحساب. تحققي من الاتصال ثم حاولي مجدداً.');
  return t('We could not complete that account request. Check your details and try again.','تعذر إكمال طلب الحساب. تحققي من البيانات ثم حاولي مجدداً.');
 };
 const money=(n:number)=>`${n.toFixed(3)} ${t('KWD','د.ك')}`;
  const approximatePrice=(currency:typeof APPROXIMATE_CURRENCIES[number])=>{
   const rate=productRatesQuery.data?.rates[currency];
   if(typeof rate!=='number'||!Number.isFinite(rate)||rate<=0)return null;
   return new Intl.NumberFormat(ar?'ar-KW':'en-KW',{style:'currency',currency,maximumFractionDigits:2}).format(product.price*rate);
  };
  const formatRateDate=(value:string)=>{
   const date=new Date(value);
   return Number.isNaN(date.getTime())?value:new Intl.DateTimeFormat(ar?'ar-KW':'en-KW',{dateStyle:'medium'}).format(date);
  };
 const product=products.find(p=>p.id===selected)||products[0];
 const currentBrand=boutiques.find(b=>b.id===brand)||boutiques[0];
 const boutiqueFor=(id:number)=>boutiques.find(b=>b.id===id)!;
 const linenBoutique=boutiques.find(b=>b.id===3);
 const total=bag.reduce((n,b)=>n+(products.find(p=>p.id===b.id)?.price||0)*b.qty,0);
 const count=bag.reduce((n,b)=>n+b.qty,0);
  const checkoutEntries=bag.map(item=>({...item,product:products.find(p=>p.id===item.id)}));
  const checkoutValid=checkoutEntries.length>0&&checkoutEntries.every(({product,size,color,qty})=>
   !!product&&Number.isInteger(qty)&&qty>0&&qty<=999&&product.sizes.includes(size)&&product.colors.some(option=>option[0]===color),
  );
 const notify=(text:string)=>{setToast(text);if(toastTimer.current)clearTimeout(toastTimer.current);toastTimer.current=setTimeout(()=>setToast(''),3200)};
 useEffect(()=>()=>{if(toastTimer.current)clearTimeout(toastTimer.current)},[]);
 useEffect(()=>{
  let alive=true;
   if(initialRecoveryUrlState==='invalid')clearSupabaseAuthCallbackFromUrl();
  const {data:{subscription}}=supabase.auth.onAuthStateChange((event,session)=>{
   if(!alive)return;
   setAuthUser(session?.user??null);
    setAuthSession(session);
   setFavorites(session?.user?[]:guestFavoritesRef.current);
   setFavoriteLoading(!!session?.user);
    setOrders([]);setOrdersLoading(!!session?.user);setOrdersLoaded(false);setOrdersError('');
   setAuthReady(true);
   setAuthError('');
    if(event==='PASSWORD_RECOVERY'){
     recoveryEventSeen.current=true;
     setPage('account');
     setAuth(session?.access_token?'login':'forgot');
     setAccountPassword('');
     setRecoveryConfirmPassword('');
     setShowRecoveryPasswords(false);
     setAuthNotice('');
     setRecoveryMode(!!session?.access_token);
     setRecoveryLinkInvalid(!session?.access_token);
     if(session?.user.email)setAccountEmail(session.user.email);
     clearSupabaseAuthCallbackFromUrl();
    }
  });
  void supabase.auth.getSession().then(({data,error})=>{
   if(!alive)return;
    if(error&&initialRecoveryUrlState!=='invalid'&&initialRecoveryUrlState!=='recovery')setAuthError(friendlyAuthError(error));
   setAuthUser(data.session?.user??null);
    setAuthSession(data.session);
    if(initialRecoveryUrlState==='recovery'&&!recoveryEventSeen.current){
     setPage('account');
     setRecoveryMode(!!data.session?.access_token);
     setRecoveryLinkInvalid(!data.session?.access_token);
     setAuth(data.session?.access_token?'login':'forgot');
     if(data.session?.user.email)setAccountEmail(data.session.user.email);
     clearSupabaseAuthCallbackFromUrl();
    }
   setAuthReady(true);
   }).catch(error=>{if(alive){
    if((initialRecoveryUrlState==='recovery'||initialRecoveryUrlState==='invalid')&&!recoveryEventSeen.current){
     setPage('account');setRecoveryMode(false);setRecoveryLinkInvalid(true);setAuth('forgot');setAuthError('');clearSupabaseAuthCallbackFromUrl();
    }else if(initialRecoveryUrlState!=='recovery'&&initialRecoveryUrlState!=='invalid')setAuthError(friendlyAuthError(error));
    setAuthReady(true);
   }});
  return()=>{alive=false;subscription.unsubscribe()};
  },[]);
  useEffect(()=>{
   if(!paymentReturn)return;
   if(paymentReturn.kind==='cancel'){
    setPendingPaymentOrderId(paymentReturn.orderId);
    setPaymentNotice({kind:'cancel',message:t('Payment was cancelled. No payment was verified, and your bag is still saved.','تم إلغاء الدفع. لم يتم تأكيد أي دفعة، وما زالت حقيبتك محفوظة.')});
    setPage('orders');
    clearPaymentReturnFromUrl();
    setPaymentReturn(null);
    return;
   }
   if(!authReady)return;
   if(!paymentReturn.sessionId){
    setPaymentNotice({kind:'error',message:t('We could not verify this Stripe payment because its session details are missing. No order was marked paid.','تعذر التحقق من دفعة Stripe لأن بيانات الجلسة غير موجودة. لم يتم تسجيل الطلب كمدفوع.')});
    setPage('orders');
    clearPaymentReturnFromUrl();
    setPaymentReturn(null);
    return;
   }
   if(!authUser){
    setPage('account');
    setAuth('login');
    setAuthNotice(t('Sign in again to verify your Stripe payment securely.','سجّلي الدخول مجدداً للتحقق من دفعة Stripe بأمان.'));
    return;
   }
   if(paymentVerificationStarted.current)return;
   paymentVerificationStarted.current=true;
   let active=true;
   setPage('orders');
   setPaymentVerifying(true);
   setPaymentNotice({kind:'pending',message:t('Verifying your Stripe payment…','جارٍ التحقق من دفعتك مع Stripe…')});
   void(async()=>{
    try{
     const {data:sessionData,error:sessionError}=await supabase.auth.getSession();
     if(sessionError||!sessionData.session?.access_token||sessionData.session.user.id!==authUser.id){
      throw Object.assign(new Error('AUTH_REQUIRED'),{code:'AUTH_REQUIRED'});
     }
     const {data,error}=await supabase.functions.invoke('create-checkout-session',{
      body:{action:'verify',session_id:paymentReturn.sessionId},
     });
     if(error){
      const invokeError=error as {status?:number;context?:{status?:number}};
      if(invokeError.status===401||invokeError.context?.status===401){
       throw Object.assign(new Error('AUTH_REQUIRED'),{code:'AUTH_REQUIRED'});
      }
      throw error;
     }
     const result=data as {paid?:unknown;payment_status?:unknown}|null;
     if(result?.paid!==true||result.payment_status!=='paid')throw new Error('PAYMENT_NOT_VERIFIED');
     if(!active)return;
     setBag([]);
     setPendingPaymentOrderId(null);
     setPaymentNotice({kind:'success',message:t('Stripe verified the $1 USD test payment. Your order is saved as paid; no real charge was made.','تحققت Stripe من دفعة الاختبار البالغة ١ دولار أمريكي. حُفظ طلبك كمدفوع دون تحصيل مبلغ حقيقي.')});
     setPage('orders');
     setOrdersRetry(value=>value+1);
     clearPaymentReturnFromUrl();
     setPaymentReturn(null);
    }catch(error){
     if(!active)return;
     const item=error&&typeof error==='object'?error as {code?:string}:{};
     paymentVerificationStarted.current=false;
     if(item.code==='AUTH_REQUIRED'){
      setAuth('login');
      setAuthNotice(t('Your sign-in expired. Log in again to verify this payment.','انتهت صلاحية تسجيل الدخول. سجّلي الدخول مجدداً للتحقق من هذه الدفعة.'));
      setAuthUser(null);
      setAuthSession(null);
      setPage('account');
      void supabase.auth.signOut({scope:'local'}).catch(()=>{});
      return;
     }
     setPaymentNotice({kind:'error',message:t('We returned from Stripe but could not verify payment with Stripe. The order was not marked paid. Retry verification or contact support.','عدنا من Stripe لكن تعذر التحقق من الدفع. لم يتم تسجيل الطلب كمدفوع. أعيدي التحقق أو تواصلي مع الدعم.')});
     setPage('orders');
     clearPaymentReturnFromUrl();
    }finally{
     if(active)setPaymentVerifying(false);
    }
   })();
   return()=>{active=false;paymentVerificationStarted.current=false;setPaymentVerifying(false)};
  },[paymentReturn,authReady,authUser?.id,paymentVerificationRetry]);
 useEffect(()=>{guestFavoritesRef.current=guestFavorites},[guestFavorites]);
  useEffect(()=>{
   if(page!=='orders'){
    setOrders([]);setOrdersError('');setOrdersLoading(false);setOrdersLoaded(false);
    return;
   }
   if(!authReady){setOrdersLoading(true);return}
   let active=true;
   const requestId=++ordersRequestId.current;
   const redirectToLogin=()=>{
    setOrders([]);setOrdersLoading(false);setOrdersLoaded(false);
    setAuthUser(null);setAuthSession(null);setAuth('login');
    setAuthError('');
    setAuthNotice(t('Please log in again to view your orders.','يرجى تسجيل الدخول مجدداً لعرض طلباتك.'));
    setPage('account');
    void supabase.auth.signOut({scope:'local'}).catch(()=>{});
   };
   if(!authUser||!authSession?.access_token){
    redirectToLogin();
    return()=>{active=false};
   }
   setOrdersLoading(true);setOrdersLoaded(false);setOrdersError('');
   void(async()=>{
    const {data:sessionData,error:sessionError}=await supabase.auth.getSession();
    if(!active||requestId!==ordersRequestId.current)return;
    const session=sessionData.session;
    if(sessionError){
     setOrders([]);setOrdersLoading(false);setOrdersLoaded(true);
     setOrdersError(t('We could not verify your sign-in. Please retry.','تعذر التحقق من تسجيل الدخول. حاولي مجدداً.'));
     return;
    }
    if(!session?.access_token||session.user.id!==authUser.id){
     redirectToLogin();
     return;
    }
    // getUser verifies the current session's access token with Supabase Auth.
    const {data:identity,error:identityError}=await supabase.auth.getUser();
    if(!active||requestId!==ordersRequestId.current)return;
    if(identityError){
     if(identityError.status===401||identityError.status===403||identityError.name==='AuthSessionMissingError'){redirectToLogin();return}
     setOrders([]);setOrdersLoading(false);setOrdersLoaded(true);
     setOrdersError(t('We could not verify your sign-in. Please retry.','تعذر التحقق من تسجيل الدخول. حاولي مجدداً.'));
     return;
    }
    if(!identity.user||identity.user.id!==authUser.id||identity.user.id!==session.user.id){
     redirectToLogin();
     return;
    }
     const {data,error}=await supabase.from('orders')
      .select('id,order_number,status,total,currency,payment_status,items,created_at')
     .eq('user_id',identity.user.id)
     .order('created_at',{ascending:false});
    if(!active||requestId!==ordersRequestId.current)return;
     let ordersData=data as OrderListRecord[]|null;
     let ordersQueryError=error;
     if(error&&(error.code==='42703'||error.code==='PGRST204')){
      const legacy=await supabase.from('orders')
       .select('id,order_number,status,total,currency,items,created_at')
       .eq('user_id',identity.user.id)
       .order('created_at',{ascending:false});
      if(!active||requestId!==ordersRequestId.current)return;
      ordersQueryError=legacy.error;
      ordersData=(legacy.data??[]).map(order=>({...order,payment_status:'not_required' as const})) as OrderListRecord[];
     }
     if(ordersQueryError){
      const databaseError=ordersQueryError as {code?:string;message?:string};
     if(databaseError.code==='PGRST301'||databaseError.message?.toLowerCase().includes('jwt expired')||databaseError.message?.toLowerCase().includes('invalid jwt')){redirectToLogin();return}
     setOrders([]);setOrdersLoading(false);setOrdersLoaded(true);
     setOrdersError(t('Your orders could not be loaded. Please retry.','تعذر تحميل طلباتك. حاولي مجدداً.'));
     return;
    }
     setOrders(ordersData??[]);setOrdersLoading(false);setOrdersLoaded(true);setOrdersError('');
   })().catch(()=>{
    if(active&&requestId===ordersRequestId.current){
     setOrders([]);setOrdersLoading(false);setOrdersLoaded(true);
     setOrdersError(t('Your orders could not be loaded. Check your connection and retry.','تعذر تحميل طلباتك. تحققي من الاتصال ثم حاولي مجدداً.'));
    }
   });
   return()=>{active=false};
  },[page,authReady,authUser,authSession,ordersRetry]);
 useEffect(()=>{
  let alive=true;
  if(!authUser){setFavorites(guestFavorites);setFavoriteLoading(false);return()=>{alive=false}};
  setFavoriteLoading(true);
  setFavoriteLoadError(false);
  void(async()=>{
   const {data,error}=await supabase.from('favorites').select('product_id').eq('user_id',authUser.id);
   if(!alive)return;
   if(error){setFavorites([]);setFavoriteLoading(false);setFavoriteLoadError(true);notify(t('Could not load your saved favorites. Please try again.','تعذر تحميل مفضلتك. حاولي مجدداً.'));return}
   let ids=(data??[]).map(row=>row.product_id);
   const guestIds=guestFavoritesRef.current.filter(id=>products.some(product=>product.id===id)&&!ids.includes(id));
   if(guestIds.length){
    const {error:saveError}=await supabase.from('favorites').upsert(
     guestIds.map(product_id=>({user_id:authUser.id,product_id})),
     {onConflict:'user_id,product_id',ignoreDuplicates:true},
    );
    if(!alive)return;
    if(saveError)notify(t('Your guest favorites could not be added to this account. Please try again.','تعذر نقل مفضلة الزائرة إلى الحساب. حاولي مجدداً.'));
    else ids=[...ids,...guestIds];
   }
   if(alive){setFavorites([...new Set(ids)]);setFavoriteLoading(false);setFavoriteLoadError(false)}
  })().catch(()=>{if(alive){setFavorites([]);setFavoriteLoading(false);setFavoriteLoadError(true);notify(t('Could not load your saved favorites. Please try again.','تعذر تحميل مفضلتك. حاولي مجدداً.'))}});
  return()=>{alive=false};
 },[authUser,guestFavorites,products]);
  useEffect(()=>{const handle=(e:KeyboardEvent)=>{if(e.key==='Escape'){if(!orderSubmittingRef.current)setDialog(null);setMenu(false)}};window.addEventListener('keydown',handle);return()=>window.removeEventListener('keydown',handle)},[]);
 const go=(next:Page)=>{setPage(next);setMenu(false);setShowFilters(false);setFilters({...blankFilters});setDraft({...blankFilters});setSort('curated');window.scrollTo({top:0,behavior:'instant'})};
 const openProduct=(p:Product)=>{setSelected(p.id);setSize('');setColor(p.colors[0][0]);go('product')};
 const visitBrand=(id:number)=>{setBrand(id);go('collection')};
 const favorite=async(id:number)=>{
  if(!authReady){notify(t('Your account is still loading. Please try again in a moment.','جارٍ تحميل حسابك. حاولي مجدداً بعد لحظات.'));return}
  if(favoriteRequestIds.current.has(id)||favoriteLoading)return;
  const exists=favorites.includes(id);
  if(!authUser){setGuestFavorites(old=>{const next=exists?old.filter(n=>n!==id):[...old,id];guestFavoritesRef.current=next;return next});notify(exists?t('Removed from your favorites','تمت الإزالة من المفضلة'):t('Saved to your favorites on this device','تم الحفظ في مفضلة هذا الجهاز'));return}
  favoriteRequestIds.current.add(id);
  setFavoriteBusyIds(old=>[...old,id]);
  setFavorites(old=>exists?old.filter(n=>n!==id):[...old,id]);
  try{
   const result=exists
    ?await supabase.from('favorites').delete().eq('user_id',authUser.id).eq('product_id',id)
    :await supabase.from('favorites').upsert({user_id:authUser.id,product_id:id},{onConflict:'user_id,product_id',ignoreDuplicates:true});
   if(result.error)throw result.error;
   notify(exists?t('Removed from your favorites','تمت الإزالة من المفضلة'):t('Saved to your account favorites','تم الحفظ في مفضلة حسابك'));
  }catch{
   setFavorites(old=>exists?[...old,id]:old.filter(n=>n!==id));
   notify(t('Your favorites could not be saved. Please try again.','تعذر حفظ مفضلتك. حاولي مجدداً.'));
  }finally{favoriteRequestIds.current.delete(id);setFavoriteBusyIds(old=>old.filter(n=>n!==id))}
 };
 const submitAccount=async(event:FormEvent<HTMLFormElement>)=>{
  event.preventDefault();if(authBusy||!authReady)return;
  setAuthBusy(true);setAuthError('');setAuthNotice('');
  const email=accountEmail.trim().toLowerCase();
  try{
   if(recoveryMode){
     if(!authSession?.access_token){
      setRecoveryMode(false);setRecoveryLinkInvalid(true);setAuth('forgot');setAuthError('');return;
     }
     if(accountPassword.length<8){setAuthError(t('Use a password with at least 8 characters.','استخدمي كلمة مرور من ٨ أحرف على الأقل.'));return}
     if(accountPassword!==recoveryConfirmPassword){setAuthError(t('The passwords do not match.','كلمتا المرور غير متطابقتين.'));return}
    const {error}=await supabase.auth.updateUser({password:accountPassword});
    if(error)throw error;
     setRecoveryMode(false);setRecoveryLinkInvalid(false);setAccountPassword('');setRecoveryConfirmPassword('');setShowRecoveryPasswords(false);setAuth('login');
     setAuthNotice(t('Your password has been updated. You can now log in with your new password.','تم تحديث كلمة المرور. يمكنك الآن تسجيل الدخول باستخدام كلمة المرور الجديدة.'));
     void supabase.auth.signOut({scope:'local'}).catch(()=>{});
   }else if(auth==='signup'){
    const {data,error}=await supabase.auth.signUp({email,password:accountPassword,options:{data:accountName.trim()?{full_name:accountName.trim()}:undefined,emailRedirectTo:window.location.origin}});
    if(error)throw error;
    if(data.session)setAuthNotice(t('Your account is ready.','حسابك جاهز.'));
    else setAuthNotice(t('Check your email to confirm your account, then log in.','تحققي من بريدك لتأكيد الحساب، ثم سجّلي الدخول.'));
    setAccountPassword('');setAuth('login');
   }else if(auth==='forgot'){
     const {error}=await supabase.auth.resetPasswordForEmail(email,{redirectTo:PASSWORD_RESET_REDIRECT_URL});
    if(error)throw error;
    setAuthNotice(t('If that email is registered, a password reset link is on its way.','إذا كان البريد مسجلاً، فسيصلك رابط لإعادة تعيين كلمة المرور.'));
     setRecoveryLinkInvalid(false);
    setAuth('login');
   }else{
    const {error}=await supabase.auth.signInWithPassword({email,password:accountPassword});
    if(error)throw error;
    setAuthNotice(t('You are signed in.','تم تسجيل دخولك.'));
    setAccountPassword('');
   }
   }catch(error){
    if(recoveryMode&&isPasswordRecoveryFailure(error)){
     setRecoveryMode(false);setRecoveryLinkInvalid(true);setAccountPassword('');setRecoveryConfirmPassword('');setAuth('forgot');setAuthError('');
    }else setAuthError(friendlyAuthError(error));
   }
  finally{setAuthBusy(false)}
 };
 const signOut=async()=>{if(authBusy)return;setAuthBusy(true);setAuthError('');try{const {error}=await supabase.auth.signOut();if(error)throw error;setAuthNotice(t('You are signed out. Guest favorites remain on this device.','تم تسجيل خروجك. تبقى مفضلة الزائرة محفوظة على هذا الجهاز.'))}catch(error){setAuthError(friendlyAuthError(error))}finally{setAuthBusy(false)}};
 const toggleCompare=(id:number)=>{if(compare.includes(id)){setCompare(compare.filter(n=>n!==id));return}if(compare.length>=3){notify(t('Compare up to 3 pieces at a time','يمكن مقارنة ٣ قطع كحد أقصى'));return}setCompare([...compare,id]);notify(t('Added to your comparison','تمت الإضافة للمقارنة'))};
  const addToBag=()=>{if(!size){notify(t('Please choose your size first','يرجى اختيار المقاس أولاً'));return}setPendingPaymentOrderId(null);setPaymentNotice(null);setBag(old=>{const found=old.find(b=>b.id===product.id&&b.size===size&&b.color===color);return found?old.map(b=>b===found?{...b,qty:b.qty+1}:b):[...old,{id:product.id,size,color,qty:1}]});notify(t('A beautiful choice. Added to your bag.','اختيار جميل. تمت الإضافة إلى حقيبتك.'))};
  const updateQty=(index:number,delta:number)=>{setPendingPaymentOrderId(null);setPaymentNotice(null);setBag(old=>old.map((b,i)=>i===index?{...b,qty:Math.max(1,b.qty+delta)}:b));notify(t('Bag updated','تم تحديث الحقيبة'))};
 const removeBag=(index:number)=>{setPendingPaymentOrderId(null);setPaymentNotice(null);setBag(old=>old.filter((_,i)=>i!==index));notify(t('Piece removed from your bag','تمت إزالة القطعة من الحقيبة'))};
  const requireOrderLogin=()=>{
   setDialog(null);
   setAuth('login');
   setAuthError('');
   setAuthNotice(t('Sign in to place an order. Your bag will stay saved on this device.','سجّلي الدخول لتسجيل الطلب. ستبقى حقيبتك محفوظة على هذا الجهاز.'));
   go('account');
  };
  const placeOrder=async()=>{
   if(orderSubmittingRef.current)return;
   if(!authReady)return;
   if(!authUser||!authSession?.access_token){requireOrderLogin();return}
   if(!checkoutValid){
    setOrderSubmitError(t('One or more selections are unavailable. Update your bag and try again.','أحد الاختيارات لم يعد متاحاً. حدّثي حقيبتك ثم حاولي مجدداً.'));
    return;
   }
   orderSubmittingRef.current=true;
   setOrderSubmitting(true);
   setOrderSubmitError('');
   try{
    let orderId=pendingPaymentOrderId;
    if(!orderId){
     const pOrderItems=bag.map(({id,size,color,qty})=>({product_id:id,size,color,qty})) as SupabaseJson;
     const {data,error}=await supabase.rpc('place_f9_order',{p_order_items:pOrderItems});
     if(error){
      const item=error as {code?:string;message?:string};
      const message=(item.message??'').toLowerCase();
      if(item.code==='42501'||message.includes('sign in')||message.includes('jwt')){
       requireOrderLogin();
       return;
      }
      if(message.includes('no longer available')||message.includes('selected size')||message.includes('selected color')){
       setOrderSubmitError(t('A product or option in your bag is no longer available. Review your bag and try again.','أحد المنتجات أو الخيارات في حقيبتك لم يعد متاحاً. راجعي حقيبتك ثم حاولي مجدداً.'));
       return;
      }
      setOrderSubmitError(t('We could not save your order. Your bag is unchanged; please try again.','تعذر حفظ طلبك. لم تتغير حقيبتك؛ حاولي مجدداً.'));
      return;
     }
     orderId=readCreatedOrderId(data);
     if(!orderId){
      setOrderSubmitError(t('Your order could not be identified for checkout. Your bag is unchanged; please retry.','تعذر تحديد طلبك للدفع. لم تتغير حقيبتك؛ حاولي مجدداً.'));
      return;
     }
     setPendingPaymentOrderId(orderId);
    }
    const {data,error}=await supabase.functions.invoke('create-checkout-session',{
     body:{action:'create',order_id:orderId},
    });
    if(error){
     const invokeError=error as {status?:number;context?:{status?:number}};
     if(invokeError.status===401||invokeError.context?.status===401){
      requireOrderLogin();
      return;
     }
     setOrderSubmitError(t('Stripe test checkout is unavailable. Your bag and saved order are unchanged; please retry.','دفع Stripe التجريبي غير متاح. بقيت حقيبتك وطلبك محفوظين؛ حاولي مجدداً.'));
     return;
    }
    const response=data as {checkout_url?:unknown;paid?:unknown;payment_status?:unknown}|null;
    if(response?.paid===true&&response.payment_status==='paid'){
     setBag([]);
     setPendingPaymentOrderId(null);
     setPaymentNotice({kind:'success',message:t('Stripe verified the $1 USD test payment. Your order is saved as paid; no real charge was made.','تحققت Stripe من دفعة الاختبار البالغة ١ دولار أمريكي. حُفظ طلبك كمدفوع دون تحصيل مبلغ حقيقي.')});
     setDialog(null);
     setPage('orders');
     setOrdersRetry(value=>value+1);
     return;
    }
    if(typeof response?.checkout_url!=='string'){
     setOrderSubmitError(t('Stripe did not return a checkout link. Your bag is unchanged; please retry.','لم يُرجع Stripe رابط الدفع. لم تتغير حقيبتك؛ حاولي مجدداً.'));
     return;
    }
    let redirectUrl:URL;
    try{redirectUrl=new URL(response.checkout_url)}catch{throw new Error('INVALID_CHECKOUT_URL')}
    if(redirectUrl.protocol!=='https:'||redirectUrl.hostname!=='checkout.stripe.com'){
     throw new Error('INVALID_CHECKOUT_URL');
    }
    setOrderSubmitError('');
    window.location.assign(redirectUrl.toString());
   }catch{
    setOrderSubmitError(t('We could not start or verify Stripe test checkout. Your bag is unchanged; please retry.','تعذر بدء أو التحقق من دفع Stripe التجريبي. لم تتغير حقيبتك؛ حاولي مجدداً.'));
   }finally{
    orderSubmittingRef.current=false;
    setOrderSubmitting(false);
   }
  };
  const title=(p:Page)=>({home:t('Home','الرئيسية'),abayas:t('Abayas','العبايات'),women:t('Women’s Clothing','الملابس النسائية'),new:t('New Arrivals','وصل حديثاً'),boutiques:t('The boutique directory','دليل البوتيكات'),collection:ar?currentBrand.ar:currentBrand.name,product:ar?product.ar:product.name,favorites:t('Your favorites','مفضلتك'),bag:t('Your shopping bag','حقيبة التسوق'),account:t('Your private appointment','موعدك الخاص'),orders:t('My orders','طلباتي'),search:t('Find something exceptional','اكتشفي شيئاً استثنائياً'),compare:t('A closer look','نظرة أقرب'),about:t('A considered point of view','رؤية منتقاة بعناية'),contact:t('Let’s talk style','لنتحدث عن الأناقة'),privacy:t('Your privacy matters','خصوصيتك تهمنا'),terms:t('The finer details','التفاصيل المهمة'),instagram:t('The F9 visual diary','يوميات F9 البصرية'),companion:t('Your Shopping Companion','رفيقتك في التسوّق')})[p];
 const logo=()=> <span className="logo"><strong>F9</strong><span>B O U T I Q U E</span></span>;
 const navItems:Page[]=['home','abayas','women','boutiques','new'];
 const card=(p:Product)=>{const b=boutiques.find(b=>b.id===p.brand)!;return <article className="product" key={p.id}>
  <div className="product-image"><button onClick={()=>openProduct(p)} aria-label={t('View ','عرض ')+(ar?p.ar:p.name)}><img src={image(p.image)} alt={ar?p.ar:p.name} loading="lazy"/></button>{p.fresh&&<span className="product-tag">{t('JUST ARRIVED','وصل حديثاً')}</span>}<button className="favorite" onClick={()=>void favorite(p.id)} disabled={!authReady||favoriteLoading||favoriteBusyIds.includes(p.id)} aria-busy={favoriteBusyIds.includes(p.id)||favoriteLoading} aria-label={favorites.includes(p.id)?t('Remove favorite','إزالة من المفضلة'):t('Save favorite','حفظ في المفضلة')} aria-pressed={favorites.includes(p.id)}><Heart fill={favorites.includes(p.id)?'currentColor':'none'}/></button><button className="view-product" onClick={()=>openProduct(p)}>{t('VIEW PRODUCT','عرض المنتج')}</button></div>
  <div className="product-meta"><button className="boutique-name" onClick={()=>visitBrand(p.brand)}>{ar?b.ar:b.name}</button><button className="product-name" onClick={()=>openProduct(p)}>{ar?p.ar:p.name}</button><span className="product-price">{money(p.price)}</span><div className="product-options"><span dir="ltr">{p.sizes.join(' · ')}</span><span className="swatches">{p.colors.map(c=><i key={c[0]} style={{background:c[2]}} title={ar?c[1]:c[0]}/>)}</span></div><label className="compare-check" style={{flexDirection:'row'}}><input type="checkbox" checked={compare.includes(p.id)} onChange={()=>toggleCompare(p.id)}/>{t('Compare','مقارنة')}</label></div>
 </article>};
 const sectionHead=(label:string,heading:string,action?:()=>void,link?:string)=><div className="section-head"><div><span className="eyebrow">{label}</span><h2>{heading}</h2></div>{action&&<button className="text-link" onClick={action}>{link||t('Explore the edit','اكتشفي المجموعة')}<ArrowUpRight/></button>}</div>;
 const boutiqueRows=()=> <div className="boutique-list">{boutiques.map((b,i)=><div className="boutique-row" key={b.id}><span className="boutique-index">0{i+1}</span><button className="boutique-monogram" onClick={()=>visitBrand(b.id)} aria-label={ar?b.ar:b.name}>{b.mark}</button><div><h3>{ar?b.ar:b.name.toLowerCase().replace(/\b\w/g,l=>l.toUpperCase())}</h3><span className="boutique-name">{ar?b.lineAr:b.line}</span></div><p>{ar?b.storyAr:b.story}</p><button className="text-link" onClick={()=>visitBrand(b.id)}>{t('Visit boutique','زيارة البوتيك')}<ArrowUpRight/></button></div>)}</div>;
 let shown=products.filter(p=>(page!=='abayas'||p.category==='abayas')&&(page!=='women'||p.category==='women')&&(page!=='new'||p.fresh)&&(page!=='collection'||p.brand===brand)&&(page!=='favorites'||favorites.includes(p.id))&&(page!=='search'||`${p.name} ${p.ar} ${boutiqueFor(p.brand).name} ${boutiqueFor(p.brand).ar}`.toLowerCase().includes(search.toLowerCase()))&&(!filters.category||p.category===filters.category)&&(!filters.brand||p.brand===Number(filters.brand))&&(!filters.size||p.sizes.includes(filters.size))&&(!filters.min||p.price>=Number(filters.min))&&(!filters.max||p.price<=Number(filters.max)));
 if(sort==='low')shown=[...shown].sort((a,b)=>a.price-b.price);if(sort==='high')shown=[...shown].sort((a,b)=>b.price-a.price);if(sort==='newest')shown=[...shown].sort((a,b)=>Number(!!b.fresh)-Number(!!a.fresh)||b.id-a.id);
 const isCatalogue=['abayas','women','new','collection','favorites','search'].includes(page);
 return <div className="f9" dir={ar?'rtl':'ltr'} lang={lang}>
  <div className="announcement">{t('ONE PLACE. ENDLESS STYLES.  —  A CURATED WORLD OF INDEPENDENT BOUTIQUES','مكان واحد. أناقة بلا حدود. — عالم منتقى من البوتيكات المستقلة')}</div>
    <header><div className="masthead"><div className="mast-side"><button className="icon-btn mobile-only" onClick={()=>setMenu(!menu)} aria-label={t('Open menu','فتح القائمة')} aria-expanded={menu}>{menu?<X/>:<Menu/>}</button><button className="icon-btn" onClick={()=>go('search')} aria-label={t('Search','بحث')}><Search/></button><span className="place">{t('CURATED IN KUWAIT','مختارات من الكويت')}</span></div><button onClick={()=>go('home')} aria-label={t('F9 Boutique home','الرئيسية')} style={{padding:0}}>{logo()}</button><div className="mast-side end"><button className="lang" onClick={()=>setLang(ar?'en':'ar')}>{ar?'EN':'العربية'}</button><button className="icon-btn account-icon" onClick={()=>go('account')} aria-label={t('Account','الحساب')}><User/></button><button className="icon-btn" onClick={()=>go('favorites')} aria-label={t('Favorites','المفضلة')}><Heart/>{favorites.length>0&&<small>{favorites.length}</small>}</button><button className="icon-btn" onClick={()=>go('bag')} aria-label={t('Shopping bag','حقيبة التسوق')}><ShoppingBag/><small>{count}</small></button></div></div><nav className="nav" aria-label={t('Main navigation','التنقل الرئيسي')} style={{gap:'clamp(34px, 5vw, 72px)'}}>{navItems.map(n=><button key={n} className={page===n?'active':''} onClick={()=>go(n)} style={{fontSize:'clamp(15px, 1.2vw, 17px)',letterSpacing:0,padding:'14px 0'}}>{n==='boutiques'?t('Boutiques','البوتيكات'):title(n)}</button>)}</nav>{menu&&<nav className="menu-panel">{navItems.map(n=><button key={n} onClick={()=>go(n)} style={{fontSize:17,padding:'12px 0'}}>{n==='boutiques'?t('Boutiques','البوتيكات'):title(n)}</button>)}<button style={{fontSize:17,padding:'12px 0'}} onClick={()=>go('account')}>{t('Your account','حسابك')}</button></nav>}</header>
  <main>
  {page==='companion'&&<ShoppingCompanion language={lang} products={products} boutiques={boutiques} onBack={()=>go('home')} onProductClick={openProduct}/>}
  {page==='home'&&<>
   <section className="hero"><img src={image('hero')} alt={t('A couture abaya in a sunlit stone villa','عباية فاخرة في فيلا حجرية مشمسة')} fetchPriority="high"/><div className="hero-content"><span className="eyebrow">{t('THE ART OF DRESSING, BEAUTIFULLY','فن الأناقة، بتفاصيل استثنائية')}</span><h1>{t('Discover','اكتشفي')}<br/><em>{t('Your Style.','أناقتك.')}</em></h1><p>{t('Explore elegant abayas and timeless fashion from different boutiques, all in one place.','اكتشفي عبايات أنيقة وأزياء خالدة من بوتيكات مختلفة، كلها في مكان واحد.')}</p><button className="btn light" onClick={()=>go('abayas')}>{t('SHOP NOW','تسوقي الآن')}<ArrowRight/></button></div><div className="hero-bottom"><span>{t('THE SUNLIT EDIT  /  VOL. 01','مجموعة ضوء الشمس / العدد ٠١')}</span><div className="slide-index">01<i/>03</div><span>{t('INDEPENDENT SPIRIT. EXCEPTIONAL STYLE.','روح مستقلة. أناقة استثنائية.')}</span></div></section>
   <div className="promise"><span><Sparkles/>{t('THOUGHTFULLY CURATED','منتقاة بعناية')}</span><span><MapPin/>{t('BOUTIQUES WORTH DISCOVERING','بوتيكات تستحق الاكتشاف')}</span><span><PackageCheck/>{t('A MORE PERSONAL WAY TO SHOP','تجربة تسوّق تشبهك')}</span></div>
   <section className="section">{sectionHead(t('A WARDROBE, CONSIDERED','خزانة مدروسة'),t('Find your everyday extraordinary.','استثنائية في كل يوم.'))}<div className="categories"><button className="category" onClick={()=>go('abayas')}><img src={image('silk')} alt={t('Champagne silk abaya collection','مجموعة عبايات حرير شامبين')} loading="lazy"/><div className="category-copy"><div><span className="eyebrow">{t('THE BEAUTY OF SIMPLICITY','جمال البساطة')}</span><h3>{t('Abayas','العبايات')}</h3></div><ArrowUpRight/></div></button><button className="category" onClick={()=>go('women')}><img src={image('dress')} alt={t('Elegant women’s clothing','ملابس نسائية راقية')} loading="lazy"/><div className="category-copy"><div><span className="eyebrow">{t('FOR EVERY VERSION OF YOU','لكل إطلالة من إطلالاتك')}</span><h3>{t('Women’s Clothing','الملابس النسائية')}</h3></div><ArrowUpRight/></div></button></div></section>
   <section className="section feature-section">{sectionHead(t('THE F9 SELECTION','مختارات F9'),t('Pieces to fall in love with.','قطع تستحق أن تحبيها.'),()=>go('new'),t('Shop the selection','تسوقي المختارات'))}<div className="tabs">{[['featured',t('Featured Products','منتجات مختارة')],['new',t('New Arrivals','وصل حديثاً')],['best',t('Best Sellers','الأكثر مبيعاً')]].map(([id,label])=><button key={id} onClick={()=>setTab(id)} className={tab===id?'selected':''}>{label}</button>)}</div><div className="products">{(tab==='featured'?products.slice(0,4):tab==='new'?products.filter(p=>p.fresh):products.filter(p=>p.best)).map(card)}</div></section>
   <section className="editorial"><div className="editorial-image"><img src={image('black')} alt={t('Sculpted cape abaya editorial','عباية الكاب بتفاصيل منحوتة')} loading="lazy"/></div><div className="editorial-copy"><span className="eyebrow">{t('IN THE SPOTLIGHT / NOOR ATELIER','تحت الضوء / نور أتيليه')}</span><h2>{t('Quiet details.','تفاصيل هادئة.')}<br/><em>{t('Lasting impressions.','أثر لا يُنسى.')}</em></h2><p>{t('Some pieces don’t need to say a word. Discover Noor Atelier’s sculptural silhouettes, exquisite fabrics and distinctly Kuwaiti point of view.','بعض القطع لا تحتاج إلى كلمات. اكتشفي قصّات نور أتيليه المنحوتة، وأقمشتها الفاخرة، ورؤيتها الكويتية المتفرّدة.')}</p><button className="text-link" onClick={()=>visitBrand(1)}>{t('Step inside the atelier','ادخلي عالم الأتيليه')}<ArrowUpRight/></button></div></section>
   <section className="section">{sectionHead(t('DIFFERENT VOICES. ONE DESTINATION.','رؤى مختلفة. وجهة واحدة.'),t('Meet your next favorite boutique.','تعرّفي على بوتيكك المفضل القادم.'),()=>go('boutiques'),t('All boutiques','جميع البوتيكات'))}{boutiqueRows()}</section>
   <section className="section" style={{paddingTop:10}}>{sectionHead(t('FRESH PERSPECTIVES','رؤى جديدة'),t('Just arrived, just for you.','وصل حديثاً، من أجلك.'),()=>go('new'),t('View new arrivals','عرض أحدث القطع'))}<div className="products">{products.filter(p=>p.fresh).map(card)}</div></section>
   <section className="cta"><span className="eyebrow">{t('ONE PLACE. ENDLESS STYLES.','مكان واحد. أناقة بلا حدود.')}</span><h2>{t('Your style, all in one place.','أناقتك، كلها في مكان واحد.')}</h2><button className="btn" onClick={()=>go('boutiques')}>{t('EXPLORE BOUTIQUES','اكتشفي البوتيكات')}<ArrowRight/></button></section>
  </>}
  {isCatalogue&&<><div className="page-intro"><span className="eyebrow">{page==='collection'?t('THE BOUTIQUE COLLECTION','مجموعة البوتيك'):t('YOUR NEXT BEAUTIFUL FIND','اكتشافك الجميل القادم')}</span><h1>{title(page)}</h1><p>{page==='collection'?(ar?currentBrand.storyAr:currentBrand.story):page==='favorites'?t('A little collection of everything you love.','مجموعة صغيرة من كل ما تحبين.'):t('Independent boutiques. Considered designs. Pieces that feel like you.','بوتيكات مستقلة، تصاميم مدروسة، وقطع تشبهك.')}</p></div>
  <section className="catalogue">{page==='search'&&<div className="search-box"><Search/><input autoFocus value={search} onChange={e=>setSearch(e.target.value)} placeholder={t('Search a piece or boutique…','ابحثي عن قطعة أو بوتيك…')} aria-label={t('Search products and boutiques','البحث عن المنتجات والبوتيكات')}/>{search&&<button className="icon-btn" onClick={()=>setSearch('')} aria-label={t('Clear search','مسح البحث')}><X/></button>}</div>}
  <div className="toolbar"><span>{shown.length} {t('considered pieces','قطع منتقاة')}</span><button onClick={()=>setShowFilters(!showFilters)} aria-expanded={showFilters}><SlidersHorizontal/>{t('Filters','التصفية')}{Object.values(filters).some(Boolean)&&' •'}</button><select aria-label={t('Sort products','ترتيب المنتجات')} value={sort} onChange={e=>setSort(e.target.value)}><option value="curated">{t('Our selection','مختاراتنا')}</option><option value="newest">{t('Newest first','الأحدث أولاً')}</option><option value="low">{t('Price: low to high','السعر: الأقل أولاً')}</option><option value="high">{t('Price: high to low','السعر: الأعلى أولاً')}</option></select></div>
  {showFilters&&<form className="filter-panel" onSubmit={e=>{e.preventDefault();setFilters({...draft});notify(t('Your edit has been refined','تم تحديث مختاراتك'));setShowFilters(false)}}><label>{t('Category','الفئة')}<select value={draft.category} onChange={e=>setDraft({...draft,category:e.target.value})}><option value="">{t('All clothing','جميع الملابس')}</option><option value="abayas">{t('Abayas','العبايات')}</option><option value="women">{t('Women’s Clothing','الملابس النسائية')}</option></select></label><label>{t('Boutique','البوتيك')}<select value={draft.brand} onChange={e=>setDraft({...draft,brand:e.target.value})}><option value="">{t('All boutiques','كل البوتيكات')}</option>{boutiques.map(b=><option key={b.id} value={b.id}>{ar?b.ar:b.name}</option>)}</select></label><label>{t('Size','المقاس')}<select value={draft.size} onChange={e=>setDraft({...draft,size:e.target.value})}><option value="">{t('All sizes','كل المقاسات')}</option>{['XS','S','M','L','XL'].map(s=><option key={s}>{s}</option>)}</select></label><label>{t('Price range (KWD)','نطاق السعر (د.ك)')}<div style={{display:'flex',gap:8}}><input style={{width:'50%'}} type="number" min="0" step=".001" value={draft.min} onChange={e=>setDraft({...draft,min:e.target.value})} placeholder={t('Min','من')} aria-label={t('Minimum price','أقل سعر')}/><input style={{width:'50%'}} type="number" min={draft.min||'0'} step=".001" value={draft.max} onChange={e=>setDraft({...draft,max:e.target.value})} placeholder={t('Max','إلى')} aria-label={t('Maximum price','أعلى سعر')}/></div></label><div className="filter-actions"><button type="submit" className="btn">{t('Apply filters','تطبيق التصفية')}</button><button type="button" className="text-link" onClick={()=>{setDraft({...blankFilters});setFilters({...blankFilters});notify(t('All filters cleared','تم مسح جميع عوامل التصفية'))}}>{t('Clear all','مسح الكل')}</button></div></form>}
  {shown.length?<div className="products">{shown.map(card)}</div>:<div className="empty">{page==='favorites'&&favoriteLoading?<p role="status">{t('Loading your saved favorites…','جارٍ تحميل مفضلتك…')}</p>:page==='favorites'&&favoriteLoadError?<><Heart/><h2>{t('Your saved favorites are unavailable.','تعذر الوصول إلى مفضلتك.')}</h2><p>{t('They have not been deleted. Please retry.','لم يتم حذفها. يرجى المحاولة مجدداً.')}</p><button className="btn" onClick={()=>authUser&&setAuthUser({...authUser})}>{t('Try again','إعادة المحاولة')}</button></>:<><div>{page==='favorites'?<Heart/>:<Search/>}</div><h2>{page==='favorites'?t('Make room for a favorite.','اختاري ما تحبين.'):t('A different edit awaits.','مختارات أخرى بانتظارك.')}</h2><p>{page==='favorites'?t('Tap the heart on any piece to keep it close.','اضغطي على القلب بجوار أي قطعة لحفظها هنا.'):t('Try another search or clear your filters to discover more.','جرّبي بحثاً آخر أو امسحي التصفية لاكتشاف المزيد.')}</p><button className="btn" onClick={()=>{if(page==='favorites')go('new');else{setSearch('');setFilters({...blankFilters});setDraft({...blankFilters})}}}>{page==='favorites'?t('Discover new arrivals','اكتشفي أحدث القطع'):t('Reset your edit','إعادة ضبط المختارات')}</button></>}</div>}</section></>}
  {page==='boutiques'&&<><div className="page-intro"><span className="eyebrow">{t('INDEPENDENT BY NATURE','استقلالية في كل تفصيل')}</span><h1>{title(page)}</h1><p>{t('Meet the designers behind your next favorite piece. Three distinct perspectives, brought together by F9.','تعرّفي على المصممين وراء قطعتك المفضلة القادمة. ثلاث رؤى متميزة تجتمع في F9.')}</p></div><section className="section" style={{paddingTop:20}}>{boutiqueRows()}</section>{linenBoutique&&<section className="editorial"><div className="editorial-image"><img src={image('olive')} alt={t('The Linen Room collection','مجموعة ذا لينن روم')}/></div><div className="editorial-copy"><span className="eyebrow">{t('DISCOVER THE LINEN ROOM','اكتشفي ذا لينن روم')}</span><h2>{t('For the art of everyday.','لفن الحياة اليومية.')}</h2><p>{ar?linenBoutique.storyAr:linenBoutique.story}</p><button className="text-link" onClick={()=>visitBrand(3)}>{t('Visit boutique','زيارة البوتيك')}<ArrowUpRight/></button></div></section>}</>}
  {page==='product'&&<section className="detail">
   <div className="breadcrumb"><button onClick={()=>go('home')}>{t('Home','الرئيسية')}</button><ChevronRight/><button onClick={()=>go(product.category)}>{product.category==='abayas'?t('Abayas','العبايات'):t('Women’s Clothing','الملابس النسائية')}</button><ChevronRight/><span>{ar?product.ar:product.name}</span></div>
   <div className="detail-grid">
    <ProductGallery key={product.id} product={product} ar={ar}/>
    <div className="detail-info">
      <button className="boutique-name" onClick={()=>visitBrand(product.brand)}>{ar?boutiqueFor(product.brand).ar:boutiqueFor(product.brand).name}</button><h1>{ar?product.ar:product.name}</h1><div className="detail-price-label">{t('Original price · KWD','السعر الأصلي · د.ك')}</div><div className="price">{money(product.price)}</div>
      <section className="detail-currency" data-testid="panel-product-currency" aria-label={t('Approximate prices in other currencies','الأسعار التقريبية بعملات أخرى')}>
       <div className="detail-currency-heading"><span>{t('Approximate prices','أسعار تقريبية')}</span><small>{t('Based on latest KWD reference rates','حسب أحدث أسعار الصرف المرجعية للدينار الكويتي')}</small></div>
       {productRatesQuery.isLoading&&!productRatesQuery.data
        ?<p className="detail-currency-status" role="status" data-testid="status-product-rates">{t('Loading approximate prices…','جارٍ تحميل الأسعار التقريبية…')}</p>
        :!productRatesQuery.data
         ?<div className="detail-currency-status" role="alert" data-testid="status-product-rates"><span>{t('Converted prices are unavailable. The KWD price is unchanged.','الأسعار المحولة غير متاحة. يبقى السعر بالدينار كما هو.')}</span><button type="button" data-testid="button-retry-product-rates" onClick={()=>void productRatesQuery.refetch()} disabled={productRatesQuery.isFetching}>{t('Retry','إعادة المحاولة')}</button></div>
         :<>
          <div className="detail-currency-grid">{APPROXIMATE_CURRENCIES.map(currency=>{
           const value=approximatePrice(currency);
           return value?<div key={currency} data-testid={`text-estimated-price-${currency}`}><span>{currency}</span><strong>{value}</strong></div>:null;
          })}</div>
          <p className="detail-currency-note">{t('Estimates only; the original KWD boutique price remains unchanged.','أسعار تقديرية فقط؛ يبقى سعر البوتيك الأصلي بالدينار الكويتي دون تغيير.')}</p>
          {productRatesQuery.isError
           ?<div className="detail-currency-status" role="status"><span>{t('Could not refresh rates; showing the last available estimates.','تعذر تحديث الأسعار؛ نعرض آخر تقديرات متاحة.')}</span><button type="button" data-testid="button-retry-product-rates" onClick={()=>void productRatesQuery.refetch()} disabled={productRatesQuery.isFetching}>{t('Retry','إعادة المحاولة')}</button></div>
           :productRatesQuery.isFetching
            ?<p className="detail-currency-status" role="status">{t('Updating reference rates…','جارٍ تحديث أسعار الصرف المرجعية…')}</p>
            :<small className="detail-currency-updated">{t('Rates updated','آخر تحديث للأسعار')}: {formatRateDate(productRatesQuery.data.updatedAt)}</small>}
         </>}
      </section>
      <p>{ar?product.descriptionAr:product.description}</p>
     <span className="choice-label">{t('COLOR','اللون')} — {ar?product.colors.find(c=>c[0]===color)?.[1]:color}</span><div className="choices">{product.colors.map(c=><button className={color===c[0]?'selected':''} key={c[0]} onClick={()=>setColor(c[0])}>{ar?c[1]:c[0]}</button>)}</div>
     <div style={{display:'flex',justifyContent:'space-between',alignItems:'end'}}><span className="choice-label">{t('SELECT SIZE','اختاري المقاس')}</span><button className="text-link" onClick={()=>setDialog('size')}>{t('Size guide','دليل المقاسات')}</button></div><div className="choices">{product.sizes.map(s=><button key={s} className={s===size?'selected':''} onClick={()=>setSize(s)}>{s}</button>)}</div>
     <div className="buy-row"><button className="btn" onClick={addToBag}>{t('ADD TO SHOPPING BAG','أضيفي إلى الحقيبة')}<ShoppingBag/></button><button className="icon-btn" onClick={()=>void favorite(product.id)} disabled={!authReady||favoriteLoading||favoriteBusyIds.includes(product.id)} aria-busy={favoriteBusyIds.includes(product.id)||favoriteLoading} aria-label={favorites.includes(product.id)?t('Remove favorite','إزالة من المفضلة'):t('Save favorite','حفظ في المفضلة')} aria-pressed={favorites.includes(product.id)}><Heart fill={favorites.includes(product.id)?'currentColor':'none'}/></button></div>
     <label className="compare-check" style={{flexDirection:'row',marginTop:17}}><input type="checkbox" checked={compare.includes(product.id)} onChange={()=>toggleCompare(product.id)}/>{t('Add to comparison','إضافة إلى المقارنة')}</label>
     <details open><summary>{t('Details & care','التفاصيل والعناية')}</summary><p>{t('Relaxed, modest fit. Professional dry cleaning recommended. Store on a padded hanger away from direct sunlight.','قصّة محتشمة ومريحة. يُنصح بالتنظيف الجاف المتخصص. تُحفظ على علاقة مبطنة بعيداً عن أشعة الشمس.')}</p></details>
   <details><summary>{t('Delivery & returns · prototype','التوصيل والاسترجاع · نموذج تجريبي')}</summary><p>{t('Confirm availability, delivery fees and return terms with each boutique before purchase. Order records do not charge or arrange delivery.','تأكدي من التوفر ورسوم التوصيل وشروط الاسترجاع مع كل بوتيك قبل الشراء. تسجيل الطلب لا يخصم أي مبلغ ولا يرتب التوصيل.')}</p></details>
    </div>
   </div>
   <div style={{marginTop:65}}>{sectionHead(t('A LITTLE MORE TO LOVE','المزيد من الجمال'),t('You may also love','قد يعجبك أيضاً'))}<div className="products">{products.filter(p=>p.id!==product.id).slice(0,4).map(card)}</div></div>
  </section>}
   {page==='bag'&&<>
    <div className="page-intro">
     <span className="eyebrow">{t('BEAUTIFUL CHOICES','اختيارات جميلة')}</span>
     <h1>{title(page)} <span className="serif">({count})</span></h1>
     <p>{t('Your edit, one beautiful piece at a time.','مختاراتك، قطعة جميلة تلو الأخرى.')}</p>
    </div>
    {bag.length
     ?<div className="bag-layout">
      <div>{bag.map((item,index)=>{
       const p=products.find(p=>p.id===item.id);
       if(!p)return <div className="bag-item" key={`${item.id}-${item.size}-${item.color}`}>
        <p>{t('This piece is no longer available. It is excluded from your total.','هذه القطعة لم تعد متاحة، وهي غير محسوبة في الإجمالي.')}</p>
        <button className="remove" onClick={()=>removeBag(index)}>{t('Remove','إزالة')}</button>
       </div>;
       return <div className="bag-item" key={`${item.id}-${item.size}-${item.color}`}>
        <button onClick={()=>openProduct(p)}><img src={image(p.image)} alt={ar?p.ar:p.name}/></button>
        <div className="bag-item-info">
         <button className="boutique-name" onClick={()=>visitBrand(p.brand)}>{ar?boutiqueFor(p.brand).ar:boutiqueFor(p.brand).name}</button>
         <h3>{ar?p.ar:p.name}</h3>
         <p>{t('Size','المقاس')}: {item.size} / {ar?p.colors.find(c=>c[0]===item.color)?.[1]:item.color}</p>
         <div className="quantity">
          <button disabled={item.qty===1} onClick={()=>updateQty(index,-1)} aria-label={t('Decrease quantity','تقليل الكمية')}><Minus/></button>
          <span>{item.qty}</span>
          <button onClick={()=>updateQty(index,1)} aria-label={t('Increase quantity','زيادة الكمية')}><Plus/></button>
         </div>
         <button className="remove" onClick={()=>removeBag(index)}>{t('Remove','إزالة')}</button>
        </div>
        <span className="bag-item-price">{money(p.price*item.qty)}</span>
       </div>;
      })}</div>
      <aside className="order-summary">
       <h2>{t('Your selection','مختاراتك')}</h2>
       <div className="summary-line"><span>{t('Subtotal','المجموع الفرعي')}</span><span>{money(total)}</span></div>
       <div className="summary-line"><span>{t('Delivery','التوصيل')}</span><span>{t('By boutique','حسب البوتيك')}</span></div>
       <div className="summary-line total"><span>{t('Item total','إجمالي القطع')}</span><span>{money(total)}</span></div>
       <button className="btn" data-testid="button-review-order" onClick={()=>{setOrderSubmitError('');setDialog('checkout')}}>{t('REVIEW ORDER','مراجعة الطلب')}<ArrowRight/></button>
        <p>{t('Stripe sandbox test checkout only: fixed $1 USD, not your KWD cart total. No real charge or delivery.','دفع Stripe تجريبي فقط: مبلغ ثابت ١ دولار أمريكي، وليس إجمالي الحقيبة بالدينار. لا يوجد تحصيل حقيقي أو توصيل.')}</p>
       <button className="text-link" style={{marginTop:20}} onClick={()=>go('new')}>{t('Continue discovering','متابعة الاكتشاف')}</button>
      </aside>
     </div>
     :<div className="empty"><ShoppingBag/><h2>{t('A beautiful beginning.','بداية جميلة.')}</h2><p>{t('Your shopping bag is waiting for something exceptional.','حقيبتك تنتظر قطعة استثنائية.')}</p><button className="btn" onClick={()=>go('new')}>{t('Explore the latest','اكتشفي الأحدث')}</button></div>}
   </>}
  {page==='account'&&<section className="account">
   <div className="account-photo"><img src={image('silk')} alt={t('A private fashion appointment','موعد أزياء خاص')}/></div>
   <div className="account-form">
    <span className="eyebrow">{t('YOUR PRIVATE APPOINTMENT','موعدك الخاص')}</span>
    <h1>{recoveryMode?t('Choose a new password.','اختاري كلمة مرور جديدة.'):authUser&&!recoveryLinkInvalid?t('Welcome to F9.','مرحباً بك في F9.'):auth==='signup'?t('A little more you.','عالم يشبهك.'):auth==='forgot'?t('Reset your password.','إعادة تعيين كلمة المرور.'):t('Welcome to F9.','مرحباً بك في F9.')}</h1>
    {recoveryLinkInvalid&&<p className="auth-error" role="alert">{t('This password reset link is invalid, expired, or already used. Request another reset email below.','رابط إعادة تعيين كلمة المرور غير صالح أو منتهي الصلاحية أو مستخدم مسبقاً. اطلبي رابطاً جديداً أدناه.')}</p>}
    {authUser&&!recoveryMode&&!recoveryLinkInvalid?<>
     <p>{t('Signed in as','تم تسجيل الدخول باسم')} <strong dir="ltr">{authUser.email}</strong></p>
     <p>{t('Your favorites are saved privately to your account. Your shopping bag remains on this device.','تُحفظ مفضلتك لحسابك فقط. تبقى حقيبة التسوق على هذا الجهاز.')}</p>
     <p>{favorites.length} {t('saved favorites','قطع في المفضلة')}{favoriteLoading?` · ${t('Loading…','جارٍ التحميل…')}`:''}</p>
     {favoriteLoadError&&<p className="auth-error" role="alert">{t('Could not load your saved favorites. Try again from the Favorites page.','تعذر تحميل مفضلتك. حاولي مجدداً من صفحة المفضلة.')}</p>}
     <button className="text-link" onClick={()=>go('favorites')}>{t('View your favorites','عرض المفضلة')}<ArrowRight/></button>
     <button className="text-link" onClick={()=>go('orders')}>{t('My orders','طلباتي')}<PackageCheck/></button>
     {authError&&<p className="auth-error" role="alert">{authError}</p>}
     {authNotice&&<p className="auth-notice" role="status">{authNotice}</p>}
     <button className="btn" onClick={()=>void signOut()} disabled={authBusy} aria-busy={authBusy}>{authBusy?t('Signing out…','جارٍ تسجيل الخروج…'):t('Sign out','تسجيل الخروج')}</button>
    </>:!authReady?<p role="status">{t('Checking your account…','جارٍ التحقق من حسابك…')}</p>
    :<>
     {!recoveryMode&&<p>{auth==='forgot'?t('We will email you a secure password-reset link.','سنرسل رابطاً آمناً لإعادة تعيين كلمة المرور إلى بريدك.'):t('Sign in or create an account to save your favorites across devices. Passwords are handled securely by Supabase Auth.','سجّلي الدخول أو أنشئي حساباً لحفظ مفضلتك بين أجهزتك. تتولى Supabase Auth حماية كلمات المرور.')}</p>}
     {!recoveryMode&&auth!=='forgot'&&<div className="tabs" role="tablist" aria-label={t('Account access','الدخول إلى الحساب')}>
      <button type="button" role="tab" aria-selected={auth==='login'} className={auth==='login'?'selected':''} onClick={()=>{setAuth('login');setAuthError('');setAuthNotice('');setAccountPassword('')}}>{t('Log in','تسجيل الدخول')}</button>
      <button type="button" role="tab" aria-selected={auth==='signup'} className={auth==='signup'?'selected':''} onClick={()=>{setAuth('signup');setAuthError('');setAuthNotice('');setAccountPassword('');setAccountName('')}}>{t('Sign up','إنشاء حساب')}</button>
     </div>}
     <form key={`${auth}-${recoveryMode}`} onSubmit={submitAccount}>
      {recoveryMode?<>
       <label>{t('New password','كلمة المرور الجديدة')}
        <input data-testid="input-new-password" required minLength={8} autoComplete="new-password" type={showRecoveryPasswords?'text':'password'} value={accountPassword} onChange={event=>{setAccountPassword(event.target.value);setAuthError('')}} placeholder={t('At least 8 characters','٨ أحرف على الأقل')}/>
       </label>
       <label>{t('Confirm new password','تأكيد كلمة المرور الجديدة')}
        <input data-testid="input-confirm-new-password" required minLength={8} autoComplete="new-password" type={showRecoveryPasswords?'text':'password'} value={recoveryConfirmPassword} onChange={event=>{setRecoveryConfirmPassword(event.target.value);setAuthError('')}} placeholder={t('Enter the new password again','أدخلي كلمة المرور الجديدة مرة أخرى')}/>
       </label>
       <button data-testid="button-toggle-recovery-passwords" type="button" className="text-link" aria-pressed={showRecoveryPasswords} onClick={()=>setShowRecoveryPasswords(value=>!value)}>{showRecoveryPasswords?t('Hide passwords','إخفاء كلمات المرور'):t('Show passwords','إظهار كلمات المرور')}</button>
       {accountPassword.length>0&&accountPassword.length<8&&<p className="auth-error" role="alert">{t('Use at least 8 characters.','استخدمي ٨ أحرف على الأقل.')}</p>}
       {recoveryConfirmPassword.length>0&&accountPassword!==recoveryConfirmPassword&&<p className="auth-error" role="alert">{t('The passwords do not match.','كلمتا المرور غير متطابقتين.')}</p>}
      </>:<>
       {auth==='signup'&&<label>{t('Your name','اسمك')}<input autoComplete="name" value={accountName} onChange={event=>setAccountName(event.target.value)} placeholder={t('Full name','الاسم الكامل')}/></label>}
       <label>{t('Email address','البريد الإلكتروني')}<input required type="email" autoComplete="email" value={accountEmail} onChange={event=>setAccountEmail(event.target.value)} placeholder="you@example.com"/></label>
       {auth!=='forgot'&&<label>{t('Password','كلمة المرور')}<input required minLength={8} type="password" autoComplete={auth==='signup'?'new-password':'current-password'} value={accountPassword} onChange={event=>setAccountPassword(event.target.value)} placeholder={t('At least 8 characters','٨ أحرف على الأقل')}/></label>}
      </>}
      <button className="btn" type="submit" disabled={authBusy||!authReady||(recoveryMode&&(!authSession?.access_token||accountPassword.length<8||accountPassword!==recoveryConfirmPassword))} aria-busy={authBusy}>{authBusy?t('Please wait…','يرجى الانتظار…'):recoveryMode?t('UPDATE PASSWORD','تحديث كلمة المرور'):auth==='signup'?t('CREATE ACCOUNT','إنشاء الحساب'):auth==='forgot'?t('SEND RESET LINK','إرسال رابط الاستعادة'):t('LOG IN','تسجيل الدخول')}<ArrowRight/></button>
     </form>
     {authError&&<p className="auth-error" role="alert">{authError}</p>}
     {authNotice&&<p className="auth-notice" role="status" aria-live="polite">{authNotice}</p>}
     {!recoveryMode&&<button type="button" className="text-link" onClick={()=>{setAuth(auth==='forgot'?'login':'forgot');setAuthError('');setAuthNotice('');setRecoveryLinkInvalid(false)}}>{auth==='forgot'?t('Back to log in','العودة لتسجيل الدخول'):t('Forgot your password?','نسيتِ كلمة المرور؟')}</button>}
     {!authUser&&!recoveryMode&&!recoveryLinkInvalid&&<p className="auth-privacy">{t('Your password is sent only to Supabase Auth; F9 does not store it. Guest favorites stay on this device.','تُرسل كلمة المرور إلى Supabase Auth فقط، ولا يحفظها F9. تبقى مفضلة الزائرة على هذا الجهاز.')}</p>}
    </>}
    {authUser&&!recoveryMode&&!recoveryLinkInvalid&&<button className="text-link" style={{marginTop:18}} onClick={()=>go('orders')}>{t('My orders','طلباتي')}<PackageCheck/></button>}
   </div>
  </section>}
  {page==='orders'&&<section className="orders-page">
   <div className="page-intro"><span className="eyebrow">{t('YOUR PRIVATE ACCOUNT','حسابك الخاص')}</span><h1>{title('orders')}</h1><p>{t('A private record of orders placed with F9 boutiques.','سجل خاص بالطلبات التي تمت لدى بوتيكات F9.')}</p></div>
    {paymentNotice&&<div className={paymentNotice.kind==='error'?'auth-error':'auth-notice'} role={paymentNotice.kind==='error'?'alert':'status'} aria-live="polite" data-testid="status-payment-result">
     {paymentVerifying?t('Verifying your payment with Stripe…','جارٍ التحقق من دفعتك مع Stripe…'):paymentNotice.message}
     {paymentNotice.kind==='error'&&paymentReturn?.kind==='success'&&<button className="text-link" type="button" disabled={paymentVerifying} onClick={()=>{paymentVerificationStarted.current=false;setPaymentVerificationRetry(value=>value+1)}}>{paymentVerifying?t('Verifying…','جارٍ التحقق…'):t('Retry verification','إعادة التحقق')}</button>}
    </div>}
   {!authReady||ordersLoading||(!ordersLoaded&&!ordersError)
    ?<div className="empty" role="status"><PackageCheck/><p>{t('Verifying your sign-in and loading orders…','جارٍ التحقق من تسجيل الدخول وتحميل الطلبات…')}</p></div>
    :ordersError
     ?<div className="empty" role="alert"><PackageCheck/><h2>{t('Your orders are unavailable.','تعذر الوصول إلى طلباتك.')}</h2><p>{ordersError}</p><button className="btn" disabled={ordersLoading} onClick={()=>setOrdersRetry(value=>value+1)}>{ordersLoading?t('Loading…','جارٍ التحميل…'):t('Try again','إعادة المحاولة')}</button><button className="text-link" onClick={()=>{setPage('account');setAuth('login')}}>{t('Back to account','العودة إلى الحساب')}</button></div>
     :orders.length===0
      ?<div className="empty"><PackageCheck/><h2>{t('No orders yet.','لا توجد طلبات بعد.')}</h2><p>{t('Your order history will appear here after an order is placed.','سيظهر سجل طلباتك هنا بعد إتمام طلب.')}</p><button className="btn" onClick={()=>go('new')}>{t('Explore the collection','اكتشفي المجموعة')}</button></div>
      :<div className="orders-list">{orders.map(order=>{
        const orderItems=readOrderItems(order.items);
        const itemCount=orderItems.reduce((total,item)=>total+item.quantity,0);
       const totalLabel=new Intl.NumberFormat(ar?'ar-KW':'en-KW',{style:'currency',currency:order.currency}).format(Number(order.total));
       const createdAt=new Intl.DateTimeFormat(ar?'ar-KW':'en-KW',{dateStyle:'medium'}).format(new Date(order.created_at));
        const statusLabel=order.status==='Pending'?t('Pending','قيد الانتظار'):order.status==='Processing'?t('Processing','قيد المعالجة'):order.status==='Completed'?t('Completed','مكتمل'):t('Cancelled','ملغي');
        const paymentStatusLabel=order.payment_status==='paid'?t('Paid · $1 test','مدفوع · اختبار ١ دولار'):order.payment_status==='unpaid'?t('Payment pending','الدفع قيد الانتظار'):t('No payment required','لا يتطلب دفعاً');
       return <article className="order-card" key={order.id}>
         <div className="order-card-top">
          <div><span className="eyebrow">{t('ORDER','طلب')}</span><h2 dir="ltr" data-testid={`text-order-number-${order.id}`}>{order.order_number}</h2></div>
          <span className="order-status" dir="auto" data-testid={`status-order-${order.id}`}>{statusLabel}</span>
         </div>
         <div className="order-card-details">
          <span><time dateTime={order.created_at}>{createdAt}</time></span>
          <span>{itemCount} {itemCount===1?t('item','قطعة'):t('items','قطع')}</span>
           <span data-testid={`status-payment-${order.id}`}>{paymentStatusLabel}</span>
          <strong>{totalLabel}</strong>
         </div>
         <div className="order-items">
          {orderItems.map((item,index)=><div className="order-item" key={`${item.product_id}-${item.size}-${item.color}-${index}`} data-testid={`row-order-item-${order.id}-${index}`}>
           <img src={image(item.image)} alt={ar?item.product_name_ar:item.product_name} loading="lazy"/>
           <div className="order-item-copy">
            <span className="boutique-name">{ar?item.boutique_name_ar:item.boutique_name}</span>
            <h3>{ar?item.product_name_ar:item.product_name}</h3>
            <p>{t('Size','المقاس')}: {item.size} · {t('Color','اللون')}: {ar?item.color_ar:item.color}</p>
            <p>{t('Quantity','الكمية')}: {item.quantity} · {money(item.unit_price)} {t('each','للقطعة')}</p>
           </div>
           <strong>{money(item.line_total)}</strong>
          </div>)}
         </div>
       </article>
      })}</div>}
  </section>}
  {page==='compare'&&<><div className="page-intro"><span className="eyebrow">{t('CONSIDER EVERY DETAIL','تأمّلي كل تفصيل')}</span><h1>{title(page)}</h1><p>{t('Your favorite designs, side by side. Compare up to three pieces.','تصاميمك المفضلة جنباً إلى جنب. قارني حتى ثلاث قطع.')}</p></div>{compare.length?<div className="compare-table"><table><tbody><tr><th>{t('Your edit','مختاراتك')}</th>{compare.map(id=>{const p=products.find(p=>p.id===id)!;return <td key={id}><button onClick={()=>openProduct(p)} style={{padding:0,textAlign:'start'}}><img src={image(p.image)} alt={ar?p.ar:p.name}/><h3 style={{fontSize:25}}>{ar?p.ar:p.name}</h3></button><button className="remove" style={{margin:0,marginTop:12}} onClick={()=>toggleCompare(id)}>{t('Remove','إزالة')}</button></td>})}</tr>{['boutique','price','category','sizes','colors'].map(field=><tr key={field}><th>{field==='boutique'?t('Boutique','البوتيك'):field==='price'?t('Price','السعر'):field==='category'?t('Category','الفئة'):field==='sizes'?t('Sizes','المقاسات'):t('Colors','الألوان')}</th>{compare.map(id=>{const p=products.find(p=>p.id===id)!;return <td key={id}>{field==='boutique'?(ar?boutiqueFor(p.brand).ar:boutiqueFor(p.brand).name):field==='price'?money(p.price):field==='category'?(p.category==='abayas'?t('Abayas','العبايات'):t('Women’s Clothing','الملابس النسائية')):field==='sizes'?p.sizes.join(' / '):p.colors.map(c=>ar?c[1]:c[0]).join(' / ')}</td>})}</tr>)}<tr><th/>{compare.map(id=><td key={id}><button className="btn" onClick={()=>openProduct(products.find(p=>p.id===id)!)}>{t('Choose options','اختيار التفاصيل')}</button></td>)}</tr></tbody></table></div>:<div className="empty"><Scale/><h2>{t('Compare your favorites.','قارني القطع المفضلة.')}</h2><p>{t('Select Compare on any product to begin.','اختاري «مقارنة» على أي منتج للبدء.')}</p><button className="btn" onClick={()=>go('new')}>{t('Discover pieces','اكتشفي القطع')}</button></div>}</>}
  {['about','contact','privacy','terms','instagram'].includes(page)&&<><div className="page-intro"><span className="eyebrow">F9 BOUTIQUE</span><h1>{title(page)}</h1></div><div className="info-content">
  {page==='about'&&<><h2>{t('One place. Endless styles.','مكان واحد. أناقة بلا حدود.')}</h2><p>{t('F9 Boutique is a curated discovery destination for women in Kuwait. We bring independent abaya and womenswear boutiques into one considered space — so you can spend less time searching and more time finding pieces that feel like you.','F9 Boutique وجهة اكتشاف منتقاة للمرأة في الكويت. نجمع بوتيكات العبايات والأزياء النسائية المستقلة في مساحة واحدة مدروسة، لتقضي وقتاً أقل في البحث ووقتاً أكثر في اكتشاف قطع تشبهك.')}</p><h2>{t('Independent style, thoughtfully gathered.','أناقة مستقلة، مختارة بعناية.')}</h2><p>{t('Our demo collection celebrates fluid silhouettes, beautiful materials and Kuwaiti design perspectives. All boutiques, products and prices shown are illustrative demo content. Editorial imagery is AI-generated.','تحتفي مجموعتنا التجريبية بالقصّات الانسيابية والخامات الجميلة والرؤى الكويتية. جميع البوتيكات والمنتجات والأسعار المعروضة محتوى توضيحي تجريبي. الصور التحريرية مولّدة بالذكاء الاصطناعي.')}</p><button className="btn" onClick={()=>go('boutiques')}>{t('Meet the boutiques','تعرّفي على البوتيكات')}</button></>}
  {page==='contact'&&<><p>{t('Have a styling question or a boutique you would love to discover here? This contact form is a demo and does not send messages.','لديك سؤال عن الأناقة أو بوتيك تودّين اكتشافه هنا؟ نموذج التواصل تجريبي ولا يرسل رسائل.')}</p><form onSubmit={e=>{e.preventDefault();notify(t('Demo only — your message was not sent or saved.','نموذج تجريبي — لم تُرسل رسالتك أو تُحفظ.'));(e.target as HTMLFormElement).reset()}}><label>{t('Name','الاسم')}<input required/></label><label>{t('Email','البريد الإلكتروني')}<input type="email" required/></label><label>{t('Your message','رسالتك')}<textarea required/></label><button className="btn" type="submit">{t('PREVIEW MESSAGE','معاينة الرسالة')}</button></form></>}
  {page==='privacy'&&<>
   <h2>{t('Your account and your choices.','حسابك وخياراتك.')}</h2>
   <p>{t('Supabase Auth handles account credentials. F9 does not store your password. Favorites and order records are saved to your Supabase account and protected so you can access only your own data. The shopping bag stays in this browser until an order is placed.','تتولى Supabase Auth إدارة بيانات الحساب، ولا يحفظ F9 كلمة مرورك. تُحفظ المفضلة وسجلات الطلبات في حسابك على Supabase ولا يمكنك الوصول إلا إلى بياناتك. تبقى حقيبة التسوق في هذا المتصفح حتى تسجيل الطلب.')}</p>
   <h2>{t('Your choices','خياراتك')}</h2>
   <p>{t('Sign out to use this device as a guest. Clear this site’s browser data to remove guest favorites and your shopping bag. Order records remain linked to your account.','سجّلي الخروج لاستخدام الجهاز كزائرة. امسحي بيانات الموقع لحذف مفضلة الزائرة وحقيبة التسوق. تبقى سجلات الطلبات مرتبطة بحسابك.')}</p>
  </>}
  {page==='terms'&&<>
   <h2>{t('A fashion discovery prototype.','نموذج لاكتشاف الأزياء.')}</h2>
   <p>{t('Products, boutiques, availability and KWD cart totals are illustrative. Checkout is Stripe sandbox only: a fixed $1 USD test payment, not the cart total. No real charge or delivery is created.','المنتجات والبوتيكات والتوفر وإجمالي الحقيبة بالدينار توضيحية. الدفع عبر Stripe تجريبي فقط بمبلغ ثابت ١ دولار أمريكي، وليس إجمالي الحقيبة. لا يتم تحصيل مبلغ حقيقي أو توفير التوصيل.')}</p>
   <h2>{t('Before a real purchase','قبل أي شراء فعلي')}</h2>
   <p>{t('Each boutique would confirm its own garment measurements, stock, delivery charges and return policy before any real purchase. This prototype makes no shipping or return promises.','يؤكد كل بوتيك مقاسات الملابس والمخزون ورسوم التوصيل وسياسة الاسترجاع قبل أي شراء فعلي. لا يقدم هذا النموذج وعوداً بالشحن أو الاسترجاع.')}</p>
  </>}
  {page==='instagram'&&<><p>{t('A visual diary of sunlit silhouettes and independent style. This is a demo editorial gallery, not a connected Instagram account.','يوميات بصرية لقصّات مضيئة وأناقة مستقلة. هذا معرض تحريري تجريبي وليس حساب إنستغرام متصلاً.')}</p><div className="products" style={{gridTemplateColumns:'repeat(2,minmax(0,1fr))'}}>{products.slice(0,4).map(card)}</div></>}
  </div></>}
  </main>
  {page!=='companion'&&<button className="stylist-float" type="button" data-testid="button-open-stylist" aria-label={t('Ask Your Stylist','اسألي منسقة الأزياء')} onClick={()=>go('companion')}><MessageCircle aria-hidden="true"/><span>{t('Ask Your Stylist','اسألي منسقة الأزياء')}</span></button>}
   <footer className="footer">
    <div className="footer-top">
     <div><button onClick={()=>go('home')} style={{padding:0}} aria-label={t('Home','الرئيسية')}>{logo()}</button><p>{t('One Place. Endless Styles.','مكان واحد. أناقة بلا حدود.')}<br/>{t('A considered collection of independent voices.','مختارات مدروسة من رؤى مستقلة.')}</p></div>
     <div className="footer-links"><span className="eyebrow">{t('DISCOVER','اكتشفي')}</span><button onClick={()=>go('abayas')}>{t('Abayas','العبايات')}</button><button onClick={()=>go('women')}>{t('Women’s Clothing','الملابس النسائية')}</button><button onClick={()=>go('boutiques')}>{t('Our boutiques','بوتيكاتنا')}</button><button onClick={()=>go('new')}>{t('New arrivals','وصل حديثاً')}</button></div>
     <div className="footer-links"><span className="eyebrow">{t('THE FINER DETAILS','التفاصيل المهمة')}</span>{(['about','contact','instagram','privacy','terms'] as Page[]).map(p=><button key={p} onClick={()=>go(p)}>{p==='about'?t('About us','من نحن'):p==='contact'?t('Contact us','تواصلي معنا'):p==='instagram'?t('Instagram','إنستغرام'):p==='privacy'?t('Privacy policy','سياسة الخصوصية'):t('Terms & conditions','الشروط والأحكام')}</button>)}</div>
    </div>
    <div className="footer-bottom"><span>© {new Date().getFullYear()} F9 BOUTIQUE. {t('ALL RIGHTS RESERVED.','جميع الحقوق محفوظة.')}</span><span>{t('STRIPE SANDBOX · $1 USD TEST · NO REAL CHARGE','Stripe تجريبي · اختبار ١ دولار · دون تحصيل حقيقي')}</span></div>
   </footer>
  {compare.length>0&&page!=='compare'&&<div className="compare-bar"><Scale/><span>{compare.length}/3 {t('pieces selected','قطع مختارة')}</span><button className="btn" onClick={()=>go('compare')}>{t('Compare pieces','مقارنة القطع')}<ArrowRight/></button><button className="icon-btn" onClick={()=>setCompare([])} aria-label={t('Clear comparison','مسح المقارنة')}><X/></button></div>}
  {toast&&<div className="toast" role="status"><Check/><span>{toast}</span><button className="icon-btn" onClick={()=>setToast('')} aria-label={t('Dismiss','إغلاق')}><X/></button></div>}
  {dialog&&<div className="dialog-backdrop" onClick={()=>{if(!orderSubmittingRef.current)setDialog(null)}}>
   <section role="dialog" aria-modal="true" aria-label={dialog==='size'?t('Size guide','دليل المقاسات'):dialog==='checkout'?t('Review your order','مراجعة طلبك'):t('Demo notice','تنبيه تجريبي')} className="dialog" onClick={event=>event.stopPropagation()}>
    <button autoFocus className="close icon-btn" disabled={orderSubmitting} onClick={()=>{if(!orderSubmittingRef.current)setDialog(null)}} aria-label={t('Close','إغلاق')} data-testid="button-close-order-dialog"><X/></button>
    {dialog==='size'
     ?<>
      <span className="eyebrow">{t('FIND YOUR FIT','اختاري مقاسك')}</span>
      <h2>{t('A little guidance.','دليل صغير.')}</h2>
      <p>{t('Illustrative body measurements in cm. Garments have a relaxed fit. Confirm exact measurements with the boutique before any real purchase.','قياسات جسم توضيحية بالسنتيمتر. القصّات مريحة. تأكدي من القياسات الدقيقة مع البوتيك قبل أي شراء فعلي.')}</p>
      <table className="size-table"><thead><tr><th>{t('Size','المقاس')}</th><th>{t('Bust','الصدر')}</th><th>{t('Waist','الخصر')}</th><th>{t('Hips','الأرداف')}</th></tr></thead><tbody>{[['XS',82,64,90],['S',86,68,94],['M',92,74,100],['L',98,80,106],['XL',104,86,112]].map(row=><tr key={row[0]}>{row.map((value,index)=><td key={index}>{value}</td>)}</tr>)}</tbody></table>
     </>
     :dialog==='checkout'
      ?<>
       <span className="eyebrow">{t('YOUR EDIT, REVIEWED','مراجعة مختاراتك')}</span>
       <h2>{t('Beautifully considered.','مختارة بذوق.')}</h2>
        <p>{t('Your KWD cart total is saved with the order. Stripe sandbox will process a fixed $1 USD test payment—not the cart total. No real charge or delivery.','يُحفظ إجمالي حقيبتك بالدينار مع الطلب. سيعالج Stripe التجريبي دفعة ثابتة قدرها ١ دولار أمريكي، وليست إجمالي الحقيبة. لا يوجد تحصيل حقيقي أو توصيل.')}</p>
       <div className="checkout-items" data-testid="list-checkout-items">
        {checkoutEntries.map(({id,size,color,qty,product},index)=>product
         ?<div className="checkout-item" key={`${id}-${size}-${color}-${index}`}>
          <img src={image(product.image)} alt={ar?product.ar:product.name}/>
          <div><span className="boutique-name">{ar?boutiqueFor(product.brand).ar:boutiqueFor(product.brand).name}</span><h3>{ar?product.ar:product.name}</h3><p>{t('Size','المقاس')}: {size} · {t('Color','اللون')}: {ar?product.colors.find(option=>option[0]===color)?.[1]:color} · {t('Qty','الكمية')}: {qty}</p></div>
          <strong>{money(product.price*qty)}</strong>
         </div>
         :<p className="auth-error" role="alert" key={`${id}-${index}`}>{t('A piece in your bag is no longer available and will not be ordered.','إحدى القطع في حقيبتك لم تعد متاحة ولن تُضاف إلى الطلب.')}</p>)}
       </div>
       <div className="summary-line total checkout-total"><span>{t('Order total · KWD','إجمالي الطلب · د.ك')}</span><strong>{money(total)}</strong></div>
       {orderSubmitError&&<p className="auth-error" role="alert" data-testid="status-order-submit-error">{orderSubmitError}</p>}
       {authReady&&authUser&&authSession?.access_token
        ?<button className="btn" type="button" data-testid="button-place-order" onClick={()=>void placeOrder()} disabled={!checkoutValid||orderSubmitting} aria-busy={orderSubmitting}>
          {orderSubmitting?t('STARTING TEST CHECKOUT…','جارٍ بدء الدفع التجريبي…'):t('PAY $1 TEST CHECKOUT','الدفع التجريبي · ١ دولار')}<ArrowRight/>
        </button>
        :<button className="btn" type="button" data-testid="button-login-to-place-order" onClick={requireOrderLogin} disabled={!authReady||orderSubmitting} aria-busy={!authReady}>
          {!authReady?t('CHECKING ACCOUNT…','جارٍ التحقق من الحساب…'):t('SIGN IN TO PAY $1 TEST CHECKOUT','سجّلي الدخول للدفع التجريبي · ١ دولار')}<ArrowRight/>
        </button>}
       <button className="text-link" type="button" onClick={()=>{if(!orderSubmittingRef.current)setDialog(null)}} disabled={orderSubmitting}>{t('Back to my bag','العودة إلى حقيبتي')}</button>
      </>
      :<>
       <span className="eyebrow">{t('DEMO EXPERIENCE','تجربة توضيحية')}</span>
       <h2>{t('A preview, not a sign-in.','معاينة، وليست دخولاً.')}</h2>
       <p>{t('This form demonstrates the account experience only. No account was created, no email was sent, and you have not been signed in. Your credentials were not saved.','هذا النموذج يوضح تجربة الحساب فقط. لم يُنشأ حساب ولم يُرسل بريد ولم يتم تسجيل الدخول. لم تُحفظ بياناتك.')}</p>
       <button className="btn" onClick={()=>setDialog(null)}>{t('Understood','حسناً')}</button>
      </>}
   </section>
  </div>}
 </div>;
}
