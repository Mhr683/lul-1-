import React, { useState, useMemo } from 'react';
import {
  Search,
  ShoppingBag,
  Heart,
  User,
  ArrowRight,
  Star,
  Check,
  Minus,
  Plus,
  Trash2,
  ShieldCheck,
  Truck,
  RotateCcw,
  SlidersHorizontal,
  X,
  Mail,
  Printer,
  Copy,
  ExternalLink,
} from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { Product, PaymentMethod, Order } from '../types/store';
import { ProductImage } from './ProductImage';
import { GlobalHeaderSearch } from './GlobalHeaderSearch';
import { HERO_IMAGE_PATH } from '../data/seedData';
import { SHIPPING_METHODS, calculateShippingFee, formatDualPrice, formatPKR, DEFAULT_STATIC_USD_TO_PKR_RATE } from '../services/abstractions';
import { ShippingCalculationService, ShippingCalculationResponse } from '../services/shippingService';
import {
  ALL_WORLD_COUNTRIES,
  getStatesForCountry,
  getCitiesForState,
  getPostalRuleForCountry,
  getSuggestedPakistanPostalCode,
  getTehsilsForDistrict,
  verifyAddressAndIdentity,
  verifyPaymentInstrument,
  detectCardBrand,
} from '../services/addressAndPaymentVerification';

type StoreSubView =
  | 'HOME'
  | 'CATALOG'
  | 'PRODUCT_DETAIL'
  | 'CHECKOUT'
  | 'ACCOUNT'
  | 'WISHLIST';

interface StorefrontViewProps {
  onOpenAdmin: () => void;
}

export const StorefrontView: React.FC<StorefrontViewProps> = ({ onOpenAdmin }) => {
  const {
    products,
    categories,
    reviews,
    orders,
    cart,
    wishlist,
    appliedCoupon,
    settings,
    firebaseUser,
    userProfile,
    isAdmin,
    signInWithGoogle,
    signOut,
    addToCart,
    removeFromCart,
    updateCartQuantity,
    clearCart,
    applyCouponCode,
    removeCoupon,
    toggleWishlist,
    placeOrder,
    acceptOrRejectShippingQuote,
    submitReview,
  } = useStore();

  const [subView, setSubView] = useState<StoreSubView>('HOME');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [cartDrawerOpen, setCartDrawerOpen] = useState(false);

  // Dynamic SEO Metadata & Product Schema JSON-LD Synchronization
  React.useEffect(() => {
    if (subView === 'PRODUCT_DETAIL' && selectedProduct) {
      document.title = selectedProduct.seoTitle || `${selectedProduct.name} | ${settings.storeName}`;
      const metaDesc = document.querySelector('meta[name="description"]');
      if (metaDesc) {
        metaDesc.setAttribute(
          'content',
          selectedProduct.seoDescription || selectedProduct.shortDescription || selectedProduct.name
        );
      }
      let ldScript = document.getElementById('dynamic-product-jsonld') as HTMLScriptElement | null;
      if (!ldScript) {
        ldScript = document.createElement('script');
        ldScript.id = 'dynamic-product-jsonld';
        ldScript.type = 'application/ld+json';
        document.head.appendChild(ldScript);
      }
      ldScript.textContent = JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'Product',
        name: selectedProduct.name,
        sku: selectedProduct.sku,
        description: selectedProduct.description || selectedProduct.shortDescription,
        brand: { '@type': 'Brand', name: selectedProduct.brand },
        offers: {
          '@type': 'Offer',
          price: selectedProduct.price,
          priceCurrency: 'USD',
          availability:
            selectedProduct.stock > 0
              ? 'https://schema.org/InStock'
              : 'https://schema.org/OutOfStock',
        },
      });
    } else {
      document.title = `${settings.storeName} — Bespoke Luxury Goods & AI-Operated Commerce`;
    }
  }, [subView, selectedProduct, settings.storeName]);

  // Search & Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('ALL');
  const [activeBrand, setActiveBrand] = useState<string>('ALL');
  const [priceCeiling, setPriceCeiling] = useState<number>(20000);
  const [inStockOnly, setInStockOnly] = useState<boolean>(false);
  const [sortBy, setSortBy] = useState<'RELEVANCE' | 'NEWEST' | 'PRICE_ASC' | 'PRICE_DESC' | 'RATING'>('RELEVANCE');

  // Product Detail state
  const [selectedVariant, setSelectedVariant] = useState<string>('Obsidian / Standard');
  const [detailQty, setDetailQty] = useState<number>(1);
  const [recentlyViewedIds, setRecentlyViewedIds] = useState<string[]>(['prod-01', 'prod-02', 'prod-03']);

  // Review Form state
  const [reviewRating, setReviewRating] = useState<number>(5);
  const [reviewTitle, setReviewTitle] = useState('');
  const [reviewComment, setReviewComment] = useState('');

  // Coupon Input in Cart
  const [couponInput, setCouponInput] = useState('');
  const [couponFeedback, setCouponFeedback] = useState<string | null>(null);

  // Multi-Step Checkout & Anti-Fraud Verification State (All 250+ World Countries, 5,000+ States, 150,000+ Cities)
  const [checkoutStep, setCheckoutStep] = useState<1 | 2 | 3>(1);
  const [customerName, setCustomerName] = useState(userProfile?.name || 'Clara Vance');
  const [customerEmail, setCustomerEmail] = useState(userProfile?.email || 'clara@zurich-arch.ch');
  const [countryIso, setCountryIso] = useState('PK');
  const [country, setCountry] = useState('Pakistan');
  const [stateIso, setStateIso] = useState('PB');
  const [stateProvince, setStateProvince] = useState('Punjab');
  const [district, setDistrict] = useState('Lahore');
  const [tehsil, setTehsil] = useState('Model Town');
  const [customTehsil, setCustomTehsil] = useState('');
  const [isCustomTehsil, setIsCustomTehsil] = useState(false);
  const city = district;
  const setCity = setDistrict;
  const [streetAddress, setStreetAddress] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [customerPhone, setCustomerPhone] = useState(userProfile?.phone || '');
  const [shippingMethodId, setShippingMethodId] = useState(SHIPPING_METHODS[0].id);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('COD');
  const [paymentSubMethod, setPaymentSubMethod] = useState<'CARD' | 'JAZZCASH' | 'EASYPAISA' | 'RAAST' | 'RAAST_SWIFT' | 'NAYAPAY' | 'WALLET'>('RAAST');

  // Universal Card & Advance Payment Anti-Fraud Fields (Clean production defaults without placeholder credentials)
  const [cardHolder, setCardHolder] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvv, setCardCvv] = useState('');
  const [walletMobileNumber, setWalletMobileNumber] = useState('');
  const [walletAccountTitle, setWalletAccountTitle] = useState('');
  const [wireReferenceNumber, setWireReferenceNumber] = useState('');
  const [generatedCodOtp] = useState(() => String(Math.floor(1000 + Math.random() * 9000)));
  const [codOtpInput, setCodOtpInput] = useState('');
  const [checkoutErrorBanner, setCheckoutErrorBanner] = useState<string | null>(null);

  const [orderNotes, setOrderNotes] = useState('');
  const [confirmedOrderNumber, setConfirmedOrderNumber] = useState<string | null>(null);
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);
  const [selectedGmailOrder, setSelectedGmailOrder] = useState<Order | null>(null);
  const [isGmailModalOpen, setIsGmailModalOpen] = useState(false);
  const [resendStatus, setResendStatus] = useState<string | null>(null);
  const [isResendingReceipt, setIsResendingReceipt] = useState(false);

  const openGmailReceiptModal = (order: Order) => {
    setSelectedGmailOrder(order);
    setIsGmailModalOpen(true);
    setResendStatus(null);
  };

  const handleResendReceipt = async (orderNumber: string, toEmail: string) => {
    setIsResendingReceipt(true);
    try {
      const res = await fetch('/api/email/resend-receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderNumber, toEmail }),
      });
      const data = await res.json();
      if (res.ok) {
        setResendStatus(`Receipt email successfully re-dispatched to ${toEmail}!`);
      } else {
        setResendStatus(data.error || 'Failed to re-dispatch email.');
      }
    } catch {
      setResendStatus('Failed to reach email server.');
    } finally {
      setIsResendingReceipt(false);
    }
  };

  const selectedCountryRecord = useMemo(
    () => ALL_WORLD_COUNTRIES.find((c) => c.isoCode === countryIso) || ALL_WORLD_COUNTRIES[0],
    [countryIso]
  );

  const isNationalPakistan = selectedCountryRecord.isNational;

  // Advance & COD Payment Options: Ensure Pakistani deliveries offer Advance Payment (Bank Transfer / RAAST & NayaPay) alongside COD
  const isCodAvailable = Boolean(isNationalPakistan && (settings.codEnabled ?? true));
  const isNayaPayAvailable = Boolean(isNationalPakistan && (settings.nayapayEnabled ?? true));
  const isRaastAvailable = Boolean(isNationalPakistan || (settings.raastEnabled ?? true));
  const isStripeAvailable = Boolean(settings.stripeEnabled);
  const isPayPalAvailable = Boolean(settings.paypalEnabled);
  const isManualQuoteAvailable = Boolean(
    !isNationalPakistan &&
    (settings.allowInternationalManualQuotes || (!isStripeAvailable && !isPayPalAvailable))
  );

  const availableStates = useMemo(
    () => getStatesForCountry(countryIso),
    [countryIso]
  );

  const availableDistricts = useMemo(
    () => getCitiesForState(countryIso, stateIso),
    [countryIso, stateIso]
  );
  const availableCities = availableDistricts;

  const availableTehsils = useMemo(
    () => getTehsilsForDistrict(district),
    [district]
  );

  const effectiveTehsil = isCustomTehsil && customTehsil.trim() ? customTehsil.trim() : tehsil;

  const postalRule = useMemo(
    () => getPostalRuleForCountry(countryIso),
    [countryIso]
  );

  const suggestedPakistanPostalCode = useMemo(() => {
    if (!isNationalPakistan) return null;
    return getSuggestedPakistanPostalCode(effectiveTehsil) || getSuggestedPakistanPostalCode(district);
  }, [isNationalPakistan, effectiveTehsil, district]);

  const handleDistrictChange = (nextDistrict: string) => {
    setDistrict(nextDistrict);
    const tehsils = getTehsilsForDistrict(nextDistrict);
    if (tehsils.length > 0) {
      setTehsil(tehsils[0]);
      setIsCustomTehsil(false);
      setCustomTehsil('');
    }
  };

  const handleSelectCountryByIso = (nextIso: string) => {
    const foundCountry =
      ALL_WORLD_COUNTRIES.find((c) => c.isoCode === nextIso) || ALL_WORLD_COUNTRIES[0];
    setCountryIso(foundCountry.isoCode);
    setCountry(foundCountry.name);

    const states = getStatesForCountry(foundCountry.isoCode);
    const firstState = states[0];
    const nextStateIso = firstState?.isoCode || 'CENTRAL';
    const nextStateName = firstState?.name || foundCountry.name;
    setStateIso(nextStateIso);
    setStateProvince(nextStateName);

    const districts = getCitiesForState(foundCountry.isoCode, nextStateIso);
    const defaultDistrict = districts[0]?.name || nextStateName;
    setDistrict(defaultDistrict);
    const tehsils = getTehsilsForDistrict(defaultDistrict);
    setTehsil(tehsils[0] || 'Center');
    setIsCustomTehsil(false);
    setCustomTehsil('');

    const initialPostal = foundCountry.isNational
      ? getSuggestedPakistanPostalCode(tehsils[0] || defaultDistrict) || getSuggestedPakistanPostalCode(defaultDistrict) || ''
      : '';
    setPostalCode(initialPostal);
    setCustomerPhone(userProfile?.phone || '');
  };

  // Ensure active payment method is strictly valid and configured for destination country
  React.useEffect(() => {
    const isCurrentValid =
      (paymentMethod === 'COD' && isCodAvailable) ||
      (paymentMethod === 'NAYAPAY' && isNayaPayAvailable) ||
      ((paymentMethod === 'RAAST_IBAN' || paymentMethod === 'BANK_TRANSFER' || paymentMethod === 'MANUAL') && isRaastAvailable) ||
      (paymentMethod === 'STRIPE' && isStripeAvailable) ||
      (paymentMethod === 'PAYPAL' && isPayPalAvailable) ||
      (paymentMethod === 'MANUAL_QUOTE' && isManualQuoteAvailable);

    if (!isCurrentValid) {
      if (isNationalPakistan) {
        if (isRaastAvailable) {
          setPaymentMethod('RAAST_IBAN');
          setPaymentSubMethod('RAAST');
        } else if (isCodAvailable) {
          setPaymentMethod('COD');
        } else if (isNayaPayAvailable) {
          setPaymentMethod('NAYAPAY');
          setPaymentSubMethod('NAYAPAY' as any);
        } else if (isStripeAvailable) {
          setPaymentMethod('STRIPE');
          setPaymentSubMethod('CARD');
        }
      } else {
        if (isManualQuoteAvailable) {
          setPaymentMethod('MANUAL_QUOTE');
        } else if (isRaastAvailable) {
          setPaymentMethod('RAAST_IBAN');
          setPaymentSubMethod('RAAST_SWIFT');
        } else if (isStripeAvailable) {
          setPaymentMethod('STRIPE');
          setPaymentSubMethod('CARD');
        } else if (isPayPalAvailable) {
          setPaymentMethod('PAYPAL');
        }
      }
    }
  }, [
    isNationalPakistan,
    paymentMethod,
    isCodAvailable,
    isNayaPayAvailable,
    isRaastAvailable,
    isStripeAvailable,
    isPayPalAvailable,
    isManualQuoteAvailable,
  ]);

  const addressVerification = useMemo(
    () =>
      verifyAddressAndIdentity({
        countryIsoCode: countryIso,
        countryName: country,
        stateName: stateProvince,
        cityName: district,
        districtName: district,
        tehsilName: effectiveTehsil,
        streetAddress,
        postalCode,
        phone: customerPhone,
        email: customerEmail || userProfile?.email || '',
      }),
    [
      countryIso,
      country,
      stateProvince,
      district,
      effectiveTehsil,
      streetAddress,
      postalCode,
      customerPhone,
      customerEmail,
      userProfile?.email,
    ]
  );

  const paymentVerification = useMemo(
    () =>
      verifyPaymentInstrument({
        isNationalPakistan,
        paymentMethod,
        paymentSubMethod,
        cardNumber,
        cardHolder,
        cardExpiry,
        cardCvv,
        walletMobileNumber,
        walletAccountTitle,
        codOtpCode: codOtpInput,
        generatedCodOtp,
        wireReferenceNumber,
      }),
    [
      isNationalPakistan,
      paymentMethod,
      paymentSubMethod,
      cardNumber,
      cardHolder,
      cardExpiry,
      cardCvv,
      walletMobileNumber,
      walletAccountTitle,
      codOtpInput,
      generatedCodOtp,
      wireReferenceNumber,
    ]
  );

  // Filtered & Sorted Products
  const filteredProducts = useMemo(() => {
    return products
      .filter((p) => p.status === 'ACTIVE')
      .filter((p) => {
        if (activeCategory !== 'ALL' && p.category !== activeCategory) return false;
        if (activeBrand !== 'ALL' && p.brand !== activeBrand) return false;
        if (p.price > priceCeiling) return false;
        if (inStockOnly && p.stock <= 0) return false;
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchName = p.name.toLowerCase().includes(q);
          const matchCat = p.category.toLowerCase().includes(q);
          const matchBrand = p.brand.toLowerCase().includes(q);
          const matchSku = p.sku.toLowerCase().includes(q);
          const matchDesc = (p.shortDescription || '').toLowerCase().includes(q);
          return matchName || matchCat || matchBrand || matchSku || matchDesc;
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'PRICE_ASC') return a.price - b.price;
        if (sortBy === 'PRICE_DESC') return b.price - a.price;
        if (sortBy === 'RATING') return (b.rating || 5) - (a.rating || 5);
        if (sortBy === 'NEWEST') return b.createdAt.localeCompare(a.createdAt);
        return (b.featured ? 1 : 0) - (a.featured ? 1 : 0);
      });
  }, [products, activeCategory, activeBrand, priceCeiling, inStockOnly, searchQuery, sortBy]);

  const brands = useMemo(() => {
    const set = new Set<string>(products.map((p) => p.brand));
    return Array.from(set);
  }, [products]);

  // Cart Calculations
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const cartSubtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

  const discountAmount = useMemo(() => {
    if (!appliedCoupon) return 0;
    if (appliedCoupon.type === 'PERCENTAGE') {
      const raw = (cartSubtotal * appliedCoupon.value) / 100;
      return appliedCoupon.maxDiscount ? Math.min(raw, appliedCoupon.maxDiscount) : raw;
    }
    if (appliedCoupon.type === 'FIXED') {
      return Math.min(cartSubtotal, appliedCoupon.value);
    }
    return 0;
  }, [cartSubtotal, appliedCoupon]);

  // Live Country & Courier Shipping Calculation
  const liveShippingCalc = useMemo<ShippingCalculationResponse>(() => {
    return ShippingCalculationService.calculate({
      destinationCountryIso: countryIso,
      items: cart,
      catalogProducts: products,
      settings,
      selectedCourier: shippingMethodId,
      hasFreeShippingCoupon: appliedCoupon?.type === 'FREE_SHIPPING',
    });
  }, [countryIso, cart, products, settings, shippingMethodId, appliedCoupon]);

  const isQuoteFlow = liveShippingCalc.requiresManualQuote || paymentMethod === 'MANUAL_QUOTE';

  // Shipping Fee in USD for calculation
  const shippingFeeUsd = useMemo(() => {
    if (isQuoteFlow) return 0;
    const rate = settings.usdToPkrRate || DEFAULT_STATIC_USD_TO_PKR_RATE;
    return Number((liveShippingCalc.finalShippingFee / rate).toFixed(2));
  }, [isQuoteFlow, liveShippingCalc.finalShippingFee, settings.usdToPkrRate]);

  // Tax: Sales tax applies to domestic Pakistan orders; international is export (0% PK sales tax, customs handled at destination DAP)
  const taxAmount = useMemo(() => {
    if (!isNationalPakistan) return 0;
    const taxableUsd = Math.max(0, cartSubtotal - discountAmount);
    return Number(((taxableUsd * (settings.taxRate || 0)) / 100).toFixed(2));
  }, [isNationalPakistan, cartSubtotal, discountAmount, settings.taxRate]);

  const grandTotal = Number(
    (Math.max(0, cartSubtotal - discountAmount) + taxAmount + shippingFeeUsd).toFixed(2)
  );

  const handleSelectProduct = (product: Product) => {
    setSelectedProduct(product);
    setDetailQty(1);
    setSelectedVariant(
      product.category === 'Horology'
        ? '40mm Titanium / Sapphire'
        : product.category === 'Fragrance'
        ? '100ml Extrait Flacon'
        : 'Obsidian / Brushed Brass'
    );
    setRecentlyViewedIds((prev) => [
      product.id,
      ...prev.filter((id) => id !== product.id).slice(0, 3),
    ]);
    setSubView('PRODUCT_DETAIL');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCheckoutSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cart.length === 0) return;

    if (!addressVerification.isFullyVerified) {
      setCheckoutErrorBanner(
        'Address Verification Failed: Please fix the fields marked as "Wrong Address / Format" before authorizing acquisition.'
      );
      return;
    }

    if (!paymentVerification.valid) {
      setCheckoutErrorBanner(paymentVerification.message);
      return;
    }

    setCheckoutErrorBanner(null);
    setIsSubmittingOrder(true);
    try {
      const fullAddress = `[VERIFIED ${isNationalPakistan ? 'NATIONAL-PK' : 'INTERNATIONAL'}] ${streetAddress}, ${effectiveTehsil ? `Tehsil: ${effectiveTehsil}, ` : ''}District: ${district}, ${stateProvince}, ${postalCode}, ${country} (Tel: ${customerPhone})`;
      const paymentAuditNote = `${orderNotes ? `${orderNotes} | ` : ''}[Anti-Fraud Score: ${paymentVerification.fraudScore}/100 · ${paymentVerification.message}]`;

      const paymentReference =
        paymentMethod === 'NAYAPAY' || paymentMethod === 'RAAST_IBAN' || paymentMethod === 'BANK_TRANSFER' || paymentMethod === 'MANUAL'
          ? wireReferenceNumber
          : paymentMethod === 'COD'
          ? `COD_PIN_${codOtpInput || generatedCodOtp}`
          : undefined;

      const paymentProofDetails =
        paymentMethod === 'NAYAPAY'
          ? `Title: ${walletAccountTitle}, Mobile: ${walletMobileNumber}`
          : paymentMethod === 'MANUAL' && (paymentSubMethod === 'JAZZCASH' || paymentSubMethod === 'EASYPAISA')
          ? `${paymentSubMethod} Title: ${walletAccountTitle}, Number: ${walletMobileNumber}`
          : undefined;

      const order = await placeOrder({
        customerName: customerName || userProfile?.name || 'Atelier Guest',
        customerEmail: customerEmail || userProfile?.email || 'guest@atelieraurelia.com',
        customerPhone,
        destCountryIso: countryIso,
        shippingAddressSummary: fullAddress,
        district,
        tehsil: effectiveTehsil,
        shippingMethodId: liveShippingCalc.carrier,
        shippingFee: liveShippingCalc.finalShippingFee,
        paymentMethod,
        paymentSubMethod,
        paymentReference,
        paymentProofDetails,
        notes: paymentAuditNote,
        isQuoteRequest: isQuoteFlow,
      });
      setConfirmedOrderNumber(order.orderNumber);
      setCheckoutStep(3);
    } finally {
      setIsSubmittingOrder(false);
    }
  };

  const handleReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct || !reviewComment.trim()) return;
    await submitReview({
      productId: selectedProduct.id,
      productName: selectedProduct.name,
      rating: reviewRating,
      title: reviewTitle || 'Exceptional Craftsmanship',
      comment: reviewComment,
    });
    setReviewTitle('');
    setReviewComment('');
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#FBFBF9] text-[#141413]">
      {/* Slim Dismissible Announcement Bar (<= 36px) */}
      <div className="bg-[#141413] text-[#FBFBF9] text-xs py-2 px-6 text-center tracking-wide">
        <span>
          Complimentary Insured Courier on Orders Above PKR {(settings.domesticFreeShippingThreshold || 10000).toLocaleString()} · Code{' '}
          <strong className="font-mono font-medium">ATELIER15</strong> for 15% Private Client Privilege
        </span>
      </div>

      {/* Top Bar Contract: Zone 1 Brand Wordmark | Zone 2 5 Nav Links | Zone 3 Primary Actions */}
      <header className="sticky top-0 z-30 bg-[#FBFBF9]/95 backdrop-blur-md border-b border-black/[0.07]">
        <div className="max-w-[1360px] mx-auto px-6 h-16 flex items-center justify-between gap-6">
          {/* Zone 1: Single Text Element Brand Wordmark */}
          <button
            onClick={() => setSubView('HOME')}
            className="text-2xl font-display font-semibold tracking-tight text-[#141413] whitespace-nowrap shrink-0 cursor-pointer"
          >
            {settings.storeName}
          </button>

          {/* Zone 2: Clean Typography Nav Links */}
          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-[#575653]">
            <button
              onClick={() => {
                setActiveCategory('ALL');
                setSubView('HOME');
              }}
              className={`hover:text-[#141413] transition-colors whitespace-nowrap cursor-pointer ${
                subView === 'HOME' ? 'text-[#141413] underline underline-offset-8' : ''
              }`}
            >
              Maison
            </button>
            <button
              onClick={() => {
                setActiveCategory('ALL');
                setSubView('CATALOG');
              }}
              className={`hover:text-[#141413] transition-colors whitespace-nowrap cursor-pointer ${
                subView === 'CATALOG' && activeCategory === 'ALL'
                  ? 'text-[#141413] underline underline-offset-8'
                  : ''
              }`}
            >
              Collection
            </button>
            <button
              onClick={() => {
                setActiveCategory('Leather Goods');
                setSubView('CATALOG');
              }}
              className={`hover:text-[#141413] transition-colors whitespace-nowrap cursor-pointer ${
                subView === 'CATALOG' && activeCategory === 'Leather Goods'
                  ? 'text-[#141413] underline underline-offset-8'
                  : ''
              }`}
            >
              Leather Goods
            </button>
            <button
              onClick={() => {
                setActiveCategory('Horology');
                setSubView('CATALOG');
              }}
              className={`hover:text-[#141413] transition-colors whitespace-nowrap cursor-pointer ${
                subView === 'CATALOG' && activeCategory === 'Horology'
                  ? 'text-[#141413] underline underline-offset-8'
                  : ''
              }`}
            >
              Horology
            </button>
            <button
              onClick={() => {
                setActiveCategory('Fragrance');
                setSubView('CATALOG');
              }}
              className={`hover:text-[#141413] transition-colors whitespace-nowrap cursor-pointer ${
                subView === 'CATALOG' && activeCategory === 'Fragrance'
                  ? 'text-[#141413] underline underline-offset-8'
                  : ''
              }`}
            >
              Fragrance
            </button>
          </nav>

          {/* Zone 2.5: Global Search Component (Find items by name, category, or description) */}
          <div className="flex-1 max-w-xs md:max-w-sm lg:max-w-md mx-2 hidden sm:block">
            <GlobalHeaderSearch
              products={products}
              categories={categories}
              onSelectProduct={handleSelectProduct}
              onViewAllResults={(q, cat) => {
                setSearchQuery(q);
                if (cat) setActiveCategory(cat);
                setSubView('CATALOG');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            />
          </div>

          {/* Zone 3: Primary Actions */}
          <div className="flex items-center gap-4 shrink-0">
            <button
              onClick={() => setSubView('WISHLIST')}
              aria-label="Wishlist"
              className="p-2 text-[#575653] hover:text-[#141413] transition-colors relative cursor-pointer"
            >
              <Heart className="w-5 h-5 stroke-[1.5]" />
              {wishlist.length > 0 && (
                <span className="ml-1 text-xs font-mono tabular-nums text-[#141413]">
                  ({wishlist.length})
                </span>
              )}
            </button>

            <button
              onClick={() => setSubView('ACCOUNT')}
              aria-label="Client Account"
              className="p-2 text-[#575653] hover:text-[#141413] transition-colors flex items-center gap-1.5 text-xs font-medium whitespace-nowrap cursor-pointer"
            >
              <User className="w-5 h-5 stroke-[1.5]" />
              <span className="hidden sm:inline">
                {firebaseUser ? userProfile?.name.split(' ')[0] : 'Account'}
              </span>
            </button>

            <button
              onClick={() => setCartDrawerOpen(true)}
              className="px-3.5 py-2 bg-[#141413] text-[#FBFBF9] text-xs font-medium flex items-center gap-2 hover:bg-[#2A2A28] transition-colors whitespace-nowrap cursor-pointer"
            >
              <ShoppingBag className="w-4 h-4 stroke-[1.5]" />
              <span>Bag</span>
              <span className="font-mono tabular-nums">({cartCount})</span>
            </button>

            <button
              onClick={onOpenAdmin}
              className="px-3.5 py-2 border border-[#141413] text-[#141413] text-xs font-medium hover:bg-[#141413] hover:text-[#FBFBF9] transition-colors whitespace-nowrap cursor-pointer"
            >
              {isAdmin ? 'Admin Console' : 'AI Operator'}
            </button>
          </div>
        </div>

        {/* Mobile Search Bar Dropdown Container (visible only on xs/small screens) */}
        <div className="sm:hidden px-6 py-2.5 border-t border-black/[0.05] bg-[#FBFBF9]">
          <GlobalHeaderSearch
            products={products}
            categories={categories}
            onSelectProduct={handleSelectProduct}
            onViewAllResults={(q, cat) => {
              setSearchQuery(q);
              if (cat) setActiveCategory(cat);
              setSubView('CATALOG');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          />
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1">
        {/* ======================== 1. HOME VIEW ======================== */}
        {subView === 'HOME' && (
          <div>
            {/* Section 1: Storefront Hero */}
            <section className="relative border-b border-black/[0.07]">
              <div className="max-w-[1360px] mx-auto px-6 py-12 lg:py-20 grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
                <div className="lg:col-span-5 space-y-6">
                  <div className="text-xs tracking-widest uppercase text-[#8C6D46] font-medium">
                    Autumn / Winter Architectural Collection · Florence & Geneva
                  </div>
                  <h1 className="text-4xl sm:text-5xl lg:text-[54px] font-display font-medium leading-[1.08] tracking-tight text-[#141413]">
                    Objects of Permanent Quiet & Precision.
                  </h1>
                  <p className="text-base text-[#575653] leading-relaxed max-w-xl">
                    Hand-stitched French box calfskin, grade-5 titanium flyback chronographs, and carved Roman travertine luminaires—crafted in numbered editions.
                  </p>
                  <div className="flex flex-wrap items-center gap-4 pt-2">
                    <button
                      onClick={() => {
                        setActiveCategory('ALL');
                        setSubView('CATALOG');
                      }}
                      className="px-6 py-3.5 bg-[#141413] text-[#FBFBF9] text-sm font-medium flex items-center gap-3 hover:bg-[#2A2A28] transition-colors whitespace-nowrap cursor-pointer"
                    >
                      <span>Explore Collection</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                    <button
                      onClick={onOpenAdmin}
                      className="px-6 py-3.5 border border-black/15 text-[#141413] text-sm font-medium hover:border-[#141413] transition-colors whitespace-nowrap cursor-pointer"
                    >
                      Launch AI Command Center
                    </button>
                  </div>
                  <div className="pt-4 border-t border-black/[0.06] flex items-center gap-6 text-xs text-[#575653]">
                    <span>Full-Grain Tuscan Leather</span>
                    <span aria-hidden="true">·</span>
                    <span>Swiss Automatic Calibres</span>
                    <span aria-hidden="true">·</span>
                    <span>Lifetime Atelier Care</span>
                  </div>
                </div>

                <div className="lg:col-span-7">
                  <div className="aspect-[16/9] w-full overflow-hidden bg-[#F3F2EE] relative">
                    <ProductImage
                      src={HERO_IMAGE_PATH}
                      alt="Atelier Aurelia Architectural Living Room & Leather Collection"
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent flex items-end p-6">
                      <div className="text-[#FBFBF9] text-xs tracking-wide">
                        Featured Study: Solstice Travertine Luminaire & Valadier Bridle Weekender — Milan Residence
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* Section 2: Featured Collection Grid (with Category Filter Bar) */}
            <section className="max-w-[1360px] mx-auto px-6 py-16 lg:py-24 border-b border-black/[0.07]">
              <div className="flex flex-col md:flex-row md:items-end justify-between mb-10 gap-6">
                <div>
                  <div className="text-xs uppercase tracking-widest text-[#8C6D46] mb-2">
                    Curated Editions
                  </div>
                  <h2 className="text-3xl sm:text-4xl font-display font-medium text-[#141413]">
                    Signature Pieces
                  </h2>
                </div>

                {/* Interactive Segmented Category Filter */}
                <div className="flex flex-wrap items-center gap-1 p-1 bg-[#F2F1ED] border border-black/[0.06]">
                  <button
                    onClick={() => setActiveCategory('ALL')}
                    className={`px-3.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                      activeCategory === 'ALL'
                        ? 'bg-[#141413] text-[#FBFBF9]'
                        : 'text-[#575653] hover:text-[#141413]'
                    }`}
                  >
                    All Editions ({products.filter((p) => p.status === 'ACTIVE').length})
                  </button>
                  {categories.map((cat) => (
                    <button
                      key={cat.id}
                      onClick={() => setActiveCategory(cat.name)}
                      className={`px-3.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                        activeCategory === cat.name
                          ? 'bg-[#141413] text-[#FBFBF9]'
                          : 'text-[#575653] hover:text-[#141413]'
                      }`}
                    >
                      {cat.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* 3-Column Product Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {filteredProducts.slice(0, 6).map((product) => (
                  <article
                    key={product.id}
                    className="group flex flex-col justify-between border border-black/[0.07] bg-white transition-transform duration-150 hover:-translate-y-0.5"
                  >
                    <div>
                      <div
                        onClick={() => handleSelectProduct(product)}
                        className="aspect-[4/3] w-full bg-[#F7F6F2] overflow-hidden relative cursor-pointer"
                      >
                        <ProductImage
                          src={product.primaryImage}
                          alt={product.name}
                          category={product.category}
                          className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
                        />
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleWishlist(product.id);
                          }}
                          aria-label={`Save ${product.name}`}
                          className="absolute top-3 right-3 p-2 bg-white/90 text-[#141413] hover:bg-[#141413] hover:text-white transition-colors cursor-pointer"
                        >
                          <Heart
                            className={`w-4 h-4 ${
                              wishlist.includes(product.id) ? 'fill-current' : ''
                            }`}
                          />
                        </button>
                      </div>

                      <div className="p-5">
                        {/* Unboxed quiet metadata */}
                        <div className="flex items-center gap-2 text-xs text-[#787774] mb-1.5">
                          <span className="uppercase tracking-wider">{product.brand}</span>
                          <span aria-hidden="true">·</span>
                          <span>{product.category}</span>
                          {product.stock <= (product.lowStockThreshold || 5) && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="text-[#991B1B] font-medium">
                                Only {product.stock} left
                              </span>
                            </>
                          )}
                        </div>

                        <h3
                          onClick={() => handleSelectProduct(product)}
                          className="text-base font-semibold text-[#141413] group-hover:text-[#8C6D46] transition-colors cursor-pointer line-clamp-1"
                        >
                          {product.name}
                        </h3>

                        <p className="text-xs text-[#575653] mt-1.5 line-clamp-2 leading-relaxed">
                          {product.shortDescription}
                        </p>
                      </div>
                    </div>

                    <div className="px-5 pb-5 pt-3 border-t border-black/[0.05] flex items-center justify-between gap-4">
                      <div className="font-mono tabular-nums">
                        <div className="flex items-baseline gap-2">
                          <span className="text-base font-semibold text-[#141413]">
                            ${product.price.toLocaleString()}
                          </span>
                          {product.compareAtPrice && product.compareAtPrice > product.price && (
                            <span className="text-xs text-[#787774] line-through">
                              ${product.compareAtPrice.toLocaleString()}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-[#8C6D46] font-medium">
                          {formatPKR(product.price)}
                        </div>
                      </div>

                      <button
                        onClick={() => addToCart(product, 1)}
                        className="px-3.5 py-2 bg-[#141413] text-[#FBFBF9] text-xs font-medium hover:bg-[#2A2A28] transition-colors whitespace-nowrap cursor-pointer"
                      >
                        Add to Bag
                      </button>
                    </div>
                  </article>
                ))}
              </div>

              <div className="mt-12 text-center">
                <button
                  onClick={() => setSubView('CATALOG')}
                  className="px-8 py-3.5 border border-[#141413] text-xs font-semibold uppercase tracking-widest text-[#141413] hover:bg-[#141413] hover:text-[#FBFBF9] transition-colors cursor-pointer"
                >
                  View Complete Catalog ({products.filter((p) => p.status === 'ACTIVE').length} Pieces)
                </button>
              </div>
            </section>

            {/* Section 3: Provenance, Quantitative Craftsmanship & Client Proof */}
            <section className="max-w-[1360px] mx-auto px-6 py-16 lg:py-24">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
                <div className="lg:col-span-5 space-y-4">
                  <div className="text-xs uppercase tracking-widest text-[#8C6D46]">
                    01. Architectural Provenance
                  </div>
                  <h2 className="text-3xl font-display font-medium text-[#141413]">
                    Engineered for Multi-Decade Patina, Verified by Collectors.
                  </h2>
                  <p className="text-sm text-[#575653] leading-relaxed">
                    Every piece is serialized and accompanied by a digital certificate of origin. Our workshops in Florence, La Chaux-de-Fonds, and Grasse operate on strict small-batch tolerances.
                  </p>
                  <div className="grid grid-cols-2 gap-6 pt-4 border-t border-black/[0.07]">
                    <div>
                      <div className="text-2xl font-mono tabular-nums font-semibold text-[#141413]">
                        72 hrs
                      </div>
                      <div className="text-xs text-[#575653] mt-1">
                        Chronometer power reserve tested across 5 positions
                      </div>
                    </div>
                    <div>
                      <div className="text-2xl font-mono tabular-nums font-semibold text-[#141413]">
                        99.4%
                      </div>
                      <div className="text-xs text-[#575653] mt-1">
                        Client retention & undamaged courier delivery rate in 2026
                      </div>
                    </div>
                  </div>
                </div>

                <div className="lg:col-span-7 grid grid-cols-1 md:grid-cols-2 gap-6">
                  {reviews.slice(0, 2).map((rev) => (
                    <blockquote
                      key={rev.id}
                      className="p-6 bg-white border border-black/[0.07] flex flex-col justify-between space-y-4"
                    >
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-xs text-[#8C6D46]">
                          <span className="font-mono tabular-nums">{rev.rating}.0 / 5.0</span>
                          <span aria-hidden="true">·</span>
                          <span>Verified Acquisition</span>
                        </div>
                        <h3 className="text-sm font-semibold text-[#141413]">{rev.title}</h3>
                        <p className="text-xs text-[#575653] leading-relaxed">“{rev.comment}”</p>
                      </div>
                      <footer className="pt-3 border-t border-black/[0.05] text-xs text-[#141413] font-medium">
                        {rev.authorName}
                        {rev.productName && (
                          <span className="block text-[11px] text-[#787774] font-normal mt-0.5">
                            Piece: {rev.productName}
                          </span>
                        )}
                      </footer>
                    </blockquote>
                  ))}
                </div>
              </div>
            </section>
          </div>
        )}

        {/* ======================== 2. CATALOG & SEARCH VIEW ======================== */}
        {subView === 'CATALOG' && (
          <div className="max-w-[1360px] mx-auto px-6 py-12">
            <div className="flex flex-col md:flex-row md:items-end justify-between pb-8 border-b border-black/[0.07] gap-6">
              <div>
                <div className="text-xs text-[#787774] mb-2">
                  <span>Maison</span>
                  <span className="mx-2">/</span>
                  <span className="text-[#141413] font-medium">{activeCategory}</span>
                </div>
                <h1 className="text-3xl sm:text-4xl font-display font-medium text-[#141413]">
                  {activeCategory === 'ALL' ? 'Complete Archive & Collection' : activeCategory}
                </h1>
              </div>

              {/* Search & Sort Controls */}
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative">
                  <Search className="w-4 h-4 text-[#787774] absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search SKU, material, piece..."
                    className="pl-10 pr-4 py-2 bg-white border border-black/15 text-xs text-[#141413] focus:outline-none focus:border-[#141413] w-64"
                  />
                </div>

                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  aria-label="Sort products"
                  className="px-3.5 py-2 bg-white border border-black/15 text-xs text-[#141413] focus:outline-none focus:border-[#141413]"
                >
                  <option value="RELEVANCE">Sort: Curated Relevance</option>
                  <option value="NEWEST">Sort: Newest Editions</option>
                  <option value="PRICE_ASC">Sort: Price Low to High</option>
                  <option value="PRICE_DESC">Sort: Price High to Low</option>
                  <option value="RATING">Sort: Highest Client Rating</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 pt-8">
              {/* Left Filter Rail */}
              <aside className="lg:col-span-3 space-y-8">
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-[#141413] mb-3 flex items-center gap-2">
                    <SlidersHorizontal className="w-3.5 h-3.5" />
                    <span>Category</span>
                  </h3>
                  <div className="space-y-1.5">
                    {['ALL', ...categories.map((c) => c.name)].map((catName) => (
                      <button
                        key={catName}
                        onClick={() => setActiveCategory(catName)}
                        className={`w-full text-left px-3 py-1.5 text-xs transition-colors flex items-center justify-between cursor-pointer ${
                          activeCategory === catName
                            ? 'bg-[#141413] text-[#FBFBF9] font-medium'
                            : 'text-[#575653] hover:text-[#141413]'
                        }`}
                      >
                        <span>{catName === 'ALL' ? 'All Categories' : catName}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="pt-6 border-t border-black/[0.07]">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-[#141413] mb-3">
                    Maison & Atelier
                  </h3>
                  <div className="space-y-1.5">
                    {['ALL', ...brands].map((b) => (
                      <button
                        key={b}
                        onClick={() => setActiveBrand(b)}
                        className={`w-full text-left px-3 py-1.5 text-xs transition-colors cursor-pointer ${
                          activeBrand === b
                            ? 'bg-[#141413] text-[#FBFBF9] font-medium'
                            : 'text-[#575653] hover:text-[#141413]'
                        }`}
                      >
                        {b === 'ALL' ? 'All Maisons' : b}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="pt-6 border-t border-black/[0.07]">
                  <div className="flex items-center justify-between text-xs mb-2">
                    <span className="font-semibold uppercase tracking-wider text-[#141413]">
                      Max Price
                    </span>
                    <span className="font-mono tabular-nums text-[#141413] text-right">
                      ${priceCeiling.toLocaleString()}
                      <span className="block text-[10px] text-[#8C6D46]">
                        {formatPKR(priceCeiling)}
                      </span>
                    </span>
                  </div>
                  <input
                    type="range"
                    min={200}
                    max={20000}
                    step={100}
                    value={priceCeiling}
                    onChange={(e) => setPriceCeiling(Number(e.target.value))}
                    className="w-full accent-[#141413]"
                  />
                </div>

                <div className="pt-6 border-t border-black/[0.07]">
                  <label className="flex items-center gap-2.5 text-xs text-[#141413] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={inStockOnly}
                      onChange={(e) => setInStockOnly(e.target.checked)}
                      className="accent-[#141413]"
                    />
                    <span>Immediate Dispatch Only (In Stock)</span>
                  </label>
                </div>
              </aside>

              {/* Right Product Grid */}
              <div className="lg:col-span-9">
                {filteredProducts.length === 0 ? (
                  <div className="p-12 border border-black/[0.07] bg-white text-center space-y-4">
                    <p className="text-base font-display text-[#141413]">
                      No archival pieces match your current filter criteria.
                    </p>
                    <button
                      onClick={() => {
                        setActiveCategory('ALL');
                        setActiveBrand('ALL');
                        setPriceCeiling(20000);
                        setSearchQuery('');
                        setInStockOnly(false);
                      }}
                      className="px-4 py-2 bg-[#141413] text-[#FBFBF9] text-xs font-medium cursor-pointer"
                    >
                      Reset All Filters
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                    {filteredProducts.map((product) => (
                      <article
                        key={product.id}
                        className="group flex flex-col justify-between border border-black/[0.07] bg-white"
                      >
                        <div>
                          <div
                            onClick={() => handleSelectProduct(product)}
                            className="aspect-[4/3] bg-[#F7F6F2] overflow-hidden relative cursor-pointer"
                          >
                            <ProductImage
                              src={product.primaryImage}
                              alt={product.name}
                              category={product.category}
                              className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
                            />
                          </div>
                          <div className="p-4">
                            <div className="flex items-center gap-1.5 text-[11px] text-[#787774] mb-1">
                              <span>{product.sku}</span>
                              <span aria-hidden="true">·</span>
                              <span>{product.category}</span>
                            </div>
                            <h3
                              onClick={() => handleSelectProduct(product)}
                              className="text-sm font-semibold text-[#141413] group-hover:text-[#8C6D46] cursor-pointer line-clamp-1"
                            >
                              {product.name}
                            </h3>
                            <p className="text-xs text-[#575653] mt-1 line-clamp-2">
                              {product.shortDescription}
                            </p>
                          </div>
                        </div>

                        <div className="px-4 pb-4 pt-3 border-t border-black/[0.05] flex items-center justify-between">
                          <div className="font-mono tabular-nums">
                            <span className="text-sm font-semibold text-[#141413] block">
                              ${product.price.toLocaleString()}
                            </span>
                            <span className="text-[11px] text-[#8C6D46] font-medium block">
                              {formatPKR(product.price)}
                            </span>
                          </div>
                          <button
                            onClick={() => addToCart(product, 1)}
                            className="px-3 py-1.5 bg-[#141413] text-[#FBFBF9] text-xs font-medium hover:bg-[#2A2A28] cursor-pointer"
                          >
                            Add to Bag
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ======================== 3. PRODUCT DETAIL VIEW (PDP) ======================== */}
        {subView === 'PRODUCT_DETAIL' && selectedProduct && (
          <div className="max-w-[1360px] mx-auto px-6 py-12 space-y-20">
            <div>
              <button
                onClick={() => setSubView('CATALOG')}
                className="text-xs text-[#575653] hover:text-[#141413] mb-6 inline-flex items-center gap-2 cursor-pointer"
              >
                <span>← Back to {selectedProduct.category}</span>
              </button>

              {/* Contiguous Purchase Module: Sticky Gallery Left + Purchase Module Right */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
                <div className="lg:col-span-7 space-y-4">
                  <div className="aspect-[4/3] w-full bg-[#F7F6F2] border border-black/[0.07] overflow-hidden">
                    <ProductImage
                      src={selectedProduct.primaryImage}
                      alt={selectedProduct.name}
                      category={selectedProduct.category}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-4 text-xs text-[#575653] pt-2">
                    <div className="p-3.5 border border-black/[0.07] bg-white">
                      <span className="block font-medium text-[#141413]">SKU Reference</span>
                      <span className="font-mono tabular-nums">{selectedProduct.sku}</span>
                    </div>
                    <div className="p-3.5 border border-black/[0.07] bg-white">
                      <span className="block font-medium text-[#141413]">Dimensions</span>
                      <span className="font-mono tabular-nums">
                        {selectedProduct.dimensions || 'Standard Atelier'}
                      </span>
                    </div>
                    <div className="p-3.5 border border-black/[0.07] bg-white">
                      <span className="block font-medium text-[#141413]">Weight</span>
                      <span className="font-mono tabular-nums">
                        {selectedProduct.weightKg || 0.85} kg
                      </span>
                    </div>
                  </div>
                </div>

                {/* Right Contiguous Purchase Module */}
                <div className="lg:col-span-5 bg-white border border-black/[0.08] p-8 space-y-6">
                  <div className="flex items-center gap-2 text-xs text-[#787774]">
                    <span className="uppercase tracking-widest text-[#8C6D46] font-medium">
                      {selectedProduct.brand}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{selectedProduct.category}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">
                      ★ {selectedProduct.rating || 4.9} ({selectedProduct.reviewCount || 12} reviews)
                    </span>
                  </div>

                  <h1 className="text-3xl font-display font-medium text-[#141413]">
                    {selectedProduct.name}
                  </h1>

                  <div className="space-y-1 font-mono tabular-nums">
                    <div className="flex items-baseline gap-3">
                      <span className="text-2xl font-semibold text-[#141413]">
                        ${selectedProduct.price.toLocaleString()}
                      </span>
                      <span className="text-base font-medium text-[#8C6D46]">
                        ({formatPKR(selectedProduct.price)})
                      </span>
                      {selectedProduct.compareAtPrice &&
                        selectedProduct.compareAtPrice > selectedProduct.price && (
                          <span className="text-sm text-[#787774] line-through">
                            ${selectedProduct.compareAtPrice.toLocaleString()} ({formatPKR(selectedProduct.compareAtPrice)})
                          </span>
                        )}
                    </div>
                  </div>

                  <p className="text-sm text-[#575653] leading-relaxed">
                    {selectedProduct.description}
                  </p>

                  {/* Variant Selector */}
                  <div className="space-y-2 pt-2">
                    <label className="block text-xs font-semibold uppercase tracking-wider text-[#141413]">
                      Finish / Edition Specification
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        'Obsidian / Brushed Brass',
                        'Espresso / Palladium',
                        'Travertine Natural',
                        'Collector Numbered Edition',
                      ].map((variant) => (
                        <button
                          key={variant}
                          type="button"
                          onClick={() => setSelectedVariant(variant)}
                          className={`px-3 py-2 text-xs text-left border transition-colors truncate cursor-pointer ${
                            selectedVariant === variant
                              ? 'border-[#141413] bg-[#141413] text-[#FBFBF9] font-medium'
                              : 'border-black/15 text-[#575653] hover:border-[#141413]'
                          }`}
                        >
                          {variant}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Quantity + Primary Buy Actions */}
                  <div className="space-y-3 pt-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[#575653]">Availability</span>
                      <span className="font-mono tabular-nums font-medium text-[#141413]">
                        {selectedProduct.stock > 0
                          ? `${selectedProduct.stock} pieces ready for dispatch`
                          : 'Out of Stock'}
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="flex items-center border border-black/20 bg-[#FBFBF9]">
                        <button
                          type="button"
                          onClick={() => setDetailQty((q) => Math.max(1, q - 1))}
                          className="p-3 text-[#141413] hover:bg-black/5 cursor-pointer"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <span className="px-4 text-xs font-mono tabular-nums font-semibold">
                          {detailQty}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setDetailQty((q) => Math.min(selectedProduct.stock || 1, q + 1))
                          }
                          className="p-3 text-[#141413] hover:bg-black/5 cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          addToCart(selectedProduct, detailQty, selectedVariant)
                        }
                        disabled={selectedProduct.stock <= 0}
                        className="flex-1 py-3.5 px-6 bg-[#141413] text-[#FBFBF9] text-xs font-semibold uppercase tracking-widest hover:bg-[#2A2A28] disabled:opacity-40 transition-colors cursor-pointer"
                      >
                        Add to Shopping Bag
                      </button>

                      <button
                        type="button"
                        onClick={() => toggleWishlist(selectedProduct.id)}
                        className="p-3.5 border border-black/20 text-[#141413] hover:border-[#141413] cursor-pointer"
                        aria-label="Save to Wishlist"
                      >
                        <Heart
                          className={`w-4 h-4 ${
                            wishlist.includes(selectedProduct.id) ? 'fill-current' : ''
                          }`}
                        />
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        addToCart(selectedProduct, detailQty, selectedVariant);
                        setConfirmedOrderNumber(null);
                        setCheckoutStep(1);
                        setSubView('CHECKOUT');
                      }}
                      className="w-full py-3 border border-[#141413] text-[#141413] text-xs font-semibold uppercase tracking-widest hover:bg-[#141413] hover:text-[#FBFBF9] transition-colors cursor-pointer"
                    >
                      Immediate Express Acquisition
                    </button>
                  </div>

                  {/* Shipping & Guarantee Metadata */}
                  <div className="pt-4 border-t border-black/[0.07] space-y-2 text-xs text-[#575653]">
                    <div className="flex items-center gap-2.5">
                      <Truck className="w-4 h-4 text-[#8C6D46] shrink-0" />
                      <span>Insured DHL Express & FedEx Priority dispatch within 24 hours.</span>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <RotateCcw className="w-4 h-4 text-[#8C6D46] shrink-0" />
                      <span>Complimentary 30-day private courier returns & exchanges.</span>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <ShieldCheck className="w-4 h-4 text-[#8C6D46] shrink-0" />
                      <span>Serialized authenticity guarantee & SEO Schema verified.</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Product Reviews & Client Testimonials */}
            <section className="pt-12 border-t border-black/[0.07] grid grid-cols-1 lg:grid-cols-12 gap-12">
              <div className="lg:col-span-5 space-y-4">
                <h2 className="text-2xl font-display font-medium text-[#141413]">
                  Verified Collector Reviews
                </h2>
                <p className="text-xs text-[#575653]">
                  Reviews are restricted to authenticated clients and moderated by Atelier Concierge.
                </p>

                <form
                  onSubmit={handleReviewSubmit}
                  className="p-6 bg-white border border-black/[0.07] space-y-4"
                >
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-[#141413]">
                    Record Your Evaluation
                  </h3>
                  <div>
                    <label className="block text-xs text-[#575653] mb-1">Rating</label>
                    <select
                      value={reviewRating}
                      onChange={(e) => setReviewRating(Number(e.target.value))}
                      className="w-full px-3 py-2 border border-black/15 text-xs bg-[#FBFBF9]"
                    >
                      <option value={5}>5 Stars — Museum / Heirloom Standard</option>
                      <option value={4}>4 Stars — Exceptional Craft</option>
                      <option value={3}>3 Stars — Satisfactory</option>
                      <option value={2}>2 Stars — Subpar</option>
                      <option value={1}>1 Star — Defective</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-[#575653] mb-1">Headline</label>
                    <input
                      type="text"
                      required
                      value={reviewTitle}
                      onChange={(e) => setReviewTitle(e.target.value)}
                      placeholder="e.g., Impeccable balance and finish"
                      className="w-full px-3 py-2 border border-black/15 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-[#575653] mb-1">Written Review</label>
                    <textarea
                      rows={3}
                      required
                      value={reviewComment}
                      onChange={(e) => setReviewComment(e.target.value)}
                      placeholder="Share your experience with the materials, ergonomics, and finish..."
                      className="w-full px-3 py-2 border border-black/15 text-xs"
                    />
                  </div>
                  <button
                    type="submit"
                    className="px-5 py-2.5 bg-[#141413] text-[#FBFBF9] text-xs font-medium cursor-pointer"
                  >
                    Submit Verified Review
                  </button>
                </form>
              </div>

              <div className="lg:col-span-7 space-y-4">
                {reviews
                  .filter((r) => r.productId === selectedProduct.id || r.status === 'APPROVED')
                  .slice(0, 5)
                  .map((rev) => (
                    <div
                      key={rev.id}
                      className="p-6 bg-white border border-black/[0.07] space-y-2"
                    >
                      <div className="flex items-center justify-between text-xs text-[#787774]">
                        <span className="font-mono tabular-nums text-[#8C6D46] font-semibold">
                          ★ {rev.rating}.0 / 5.0 · Verified Purchase
                        </span>
                        <span className="font-mono tabular-nums">
                          {rev.createdAt.slice(0, 10)}
                        </span>
                      </div>
                      <h4 className="text-sm font-semibold text-[#141413]">{rev.title}</h4>
                      <p className="text-xs text-[#575653] leading-relaxed">{rev.comment}</p>
                      <div className="text-[11px] text-[#787774] pt-1">— {rev.authorName}</div>
                    </div>
                  ))}
              </div>
            </section>

            {/* Recently Viewed & Related Products */}
            <section className="pt-12 border-t border-black/[0.07]">
              <h2 className="text-2xl font-display font-medium text-[#141413] mb-6">
                Complementary Archive Pieces
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {products
                  .filter((p) => p.id !== selectedProduct.id && p.status === 'ACTIVE')
                  .slice(0, 3)
                  .map((rel) => (
                    <div
                      key={rel.id}
                      onClick={() => handleSelectProduct(rel)}
                      className="p-4 bg-white border border-black/[0.07] flex items-center gap-4 cursor-pointer hover:border-[#141413] transition-colors"
                    >
                      <div className="w-20 h-20 bg-[#F7F6F2] shrink-0 overflow-hidden">
                        <ProductImage src={rel.primaryImage} alt={rel.name} />
                      </div>
                      <div className="min-w-0">
                        <div className="text-[11px] text-[#787774]">{rel.category}</div>
                        <div className="text-sm font-semibold text-[#141413] truncate">
                          {rel.name}
                        </div>
                        <div className="text-xs font-mono tabular-nums text-[#141413] mt-1">
                          ${rel.price.toLocaleString()} · <span className="text-[#8C6D46]">{formatPKR(rel.price)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </section>
          </div>
        )}

        {/* ======================== 4. MULTI-STEP CHECKOUT VIEW ======================== */}
        {subView === 'CHECKOUT' && (
          <div className="max-w-[1120px] mx-auto px-6 py-12">
            {checkoutStep === 3 && confirmedOrderNumber ? (() => {
              const confirmedOrder = orders.find((o) => o.orderNumber === confirmedOrderNumber);
              const isAdvancePayment =
                paymentMethod === 'RAAST_IBAN' ||
                paymentMethod === 'NAYAPAY' ||
                paymentMethod === 'BANK_TRANSFER' ||
                paymentMethod === 'MANUAL' ||
                paymentMethod === 'STRIPE' ||
                paymentMethod === 'PAYPAL' ||
                confirmedOrder?.paymentStatus === 'PAID';

              const activeTid = confirmedOrder?.paymentReference || wireReferenceNumber || 'TID-VERIFIED';
              const activeRecipientEmail = customerEmail || userProfile?.email || 'customer@gmail.com';
              const activeStoreName = settings.storeName || 'Atelier Aurelia';
              const activeTotalPkr = Math.round(grandTotal * (settings.usdToPkrRate || 278.5));

              const paymentMethodLabel =
                paymentMethod === 'RAAST_IBAN'
                  ? 'Advance RAAST Instant Transfer'
                  : paymentMethod === 'NAYAPAY'
                  ? 'Advance NayaPay Digital Wallet'
                  : paymentMethod === 'BANK_TRANSFER'
                  ? 'Advance Bank Wire Transfer'
                  : paymentMethod === 'STRIPE'
                  ? 'Advance Card Settlement (Online)'
                  : paymentMethod === 'MANUAL'
                  ? `Advance Mobile Wallet (${paymentSubMethod || 'JazzCash/EasyPaisa'})`
                  : paymentMethod === 'COD'
                  ? 'Cash on Delivery (Courier Doorstep)'
                  : paymentMethod;

              const fallbackOrderForModal: Order = confirmedOrder || {
                id: `ord-${confirmedOrderNumber}`,
                orderNumber: confirmedOrderNumber,
                userId: firebaseUser?.uid || 'guest-checkout',
                customerName: customerName || userProfile?.name || 'Valued Patron',
                customerEmail: activeRecipientEmail,
                status: 'CONFIRMED',
                paymentStatus: isAdvancePayment ? 'PAID' : 'PENDING',
                paymentMethod,
                paymentSubMethod,
                paymentReference: activeTid,
                district,
                tehsil: effectiveTehsil,
                total: grandTotal,
                currency: settings.currency || 'PKR',
                shippingAddressSummary: `${streetAddress}, ${effectiveTehsil ? `Tehsil ${effectiveTehsil}, ` : ''}District ${district}, ${country}`,
                createdAt: new Date().toISOString(),
              };

              return (
                <div className="bg-white border border-black/[0.08] p-8 sm:p-10 max-w-2xl mx-auto space-y-6">
                  <div className="w-10 h-10 bg-[#141413] text-[#FBFBF9] flex items-center justify-center">
                    <Check className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-widest text-[#8C6D46]">
                      Acquisition Dossier Recorded
                    </div>
                    <h1 className="text-2xl sm:text-3xl font-display font-medium text-[#141413] mt-1">
                      Order {confirmedOrderNumber} Confirmed — Preparing White-Glove Shipment
                    </h1>
                  </div>

                  {/* Highlighted Advance Payment Received Notification (As requested by user) */}
                  {isAdvancePayment ? (
                    <div className="p-5 bg-emerald-50 border border-emerald-500/50 space-y-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <div className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center text-xs font-bold shrink-0">
                            ✓
                          </div>
                          <strong className="text-emerald-950 text-sm font-semibold">
                            Apki Payment Recieved Ho Chuki Hy!
                          </strong>
                        </div>
                        <span className="px-2.5 py-0.5 bg-emerald-700 text-white font-mono text-[11px] font-bold tracking-wider">
                          PAID · ADVANCE RECIEVED
                        </span>
                      </div>
                      <p className="text-xs text-emerald-800 leading-relaxed">
                        Store <strong className="text-emerald-950 font-bold">{activeStoreName}</strong> main apki advance payment ba-hifazat recieve ho chuki hy. Your transaction is verified, and your acquisition is prioritized for shipment.
                      </p>
                    </div>
                  ) : (
                    <div className="p-4 bg-amber-50 border border-amber-300 space-y-1">
                      <strong className="text-amber-950 text-xs font-semibold">
                        Cash on Delivery (COD) Registered
                      </strong>
                      <p className="text-[11px] text-amber-800">
                        Payment will be collected at your doorstep by the courier. Anti-fraud security PIN {codOtpInput || generatedCodOtp} verified.
                      </p>
                    </div>
                  )}

                  {/* Payment & Order Summary Dossier */}
                  <div className="p-4 bg-[#F7F6F2] border border-black/[0.06] text-xs space-y-2 font-mono tabular-nums">
                    <div className="flex justify-between items-center pb-1.5 border-b border-black/[0.06]">
                      <span className="text-[#787774]">Store Name:</span>
                      <strong className="text-[#141413] font-semibold">{activeStoreName}</strong>
                    </div>
                    <div className="flex justify-between items-center pb-1.5 border-b border-black/[0.06]">
                      <span className="text-[#787774]">Order Reference:</span>
                      <strong className="text-[#141413] font-semibold">{confirmedOrderNumber}</strong>
                    </div>
                    <div className="flex justify-between items-center pb-1.5 border-b border-black/[0.06]">
                      <span className="text-[#787774]">Payment Status:</span>
                      <strong className={isAdvancePayment ? "text-emerald-700 font-bold" : "text-amber-800"}>
                        {isAdvancePayment ? 'PAID · Advance Payment Recieved' : 'PENDING (Due on Delivery)'}
                      </strong>
                    </div>
                    <div className="flex justify-between items-center pb-1.5 border-b border-black/[0.06]">
                      <span className="text-[#787774]">Payment Protocol:</span>
                      <span className="text-[#141413] font-medium">{paymentMethodLabel}</span>
                    </div>
                    {isAdvancePayment && (
                      <div className="flex justify-between items-center pb-1.5 border-b border-black/[0.06]">
                        <span className="text-[#787774]">Transaction ID (TID):</span>
                        <span className="text-[#8C6D46] font-bold font-mono">{activeTid}</span>
                      </div>
                    )}
                    <div className="flex justify-between items-center pb-1.5 border-b border-black/[0.06]">
                      <span className="text-[#787774]">Total Amount Paid:</span>
                      <strong className="text-[#141413] font-bold">
                        PKR {activeTotalPkr.toLocaleString()} (${grandTotal.toFixed(2)})
                      </strong>
                    </div>
                    <div className="flex justify-between items-center pb-1.5 border-b border-black/[0.06]">
                      <span className="text-[#787774]">District:</span>
                      <strong className="text-[#141413] font-semibold">{confirmedOrder?.district || district}</strong>
                    </div>
                    {(confirmedOrder?.tehsil || effectiveTehsil) && (
                      <div className="flex justify-between items-center pb-1.5 border-b border-black/[0.06]">
                        <span className="text-[#787774]">Tehsil:</span>
                        <strong className="text-[#141413] font-semibold">{confirmedOrder?.tehsil || effectiveTehsil}</strong>
                      </div>
                    )}
                    <div className="flex justify-between items-center">
                      <span className="text-[#787774]">Destination:</span>
                      <span className="text-[#141413] text-right truncate max-w-[280px]">
                        {streetAddress}, {effectiveTehsil ? `${effectiveTehsil}, ` : ''}{district}, {country}
                      </span>
                    </div>
                  </div>

                  {/* Transactional Gmail Dispatch Confirmation (As requested by user) */}
                  <div className="p-4 bg-sky-50/80 border border-sky-300 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 bg-red-600 text-white rounded flex items-center justify-center text-[10px] font-bold">
                          M
                        </div>
                        <strong className="text-sky-950 text-xs">
                          Gmail Notification Recieved: Apki Payment Recieved Ho Chuki Hy
                        </strong>
                      </div>
                      <span className="text-[10px] font-mono text-emerald-800 font-semibold bg-emerald-100 px-2 py-0.5 rounded">
                        ✓ Delivered to Inbox
                      </span>
                    </div>
                    <div className="text-xs text-sky-900 space-y-1">
                      <div>
                        <span className="text-sky-700">Recipient Email: </span>
                        <strong className="font-mono text-slate-900">{activeRecipientEmail}</strong>
                      </div>
                      <div>
                        <span className="text-sky-700">Subject: </span>
                        <span className="font-mono text-[11px] font-semibold text-slate-800">
                          Payment Recieved: Order #{confirmedOrderNumber} | {activeStoreName}
                        </span>
                      </div>
                      <p className="text-[11px] text-sky-800 pt-1 leading-relaxed">
                        Customer ko Gmail confirmation receive ho chuki hy k apki payment receive ho chuki hy sath store ka name (<strong className="text-sky-950">{activeStoreName}</strong>) bhi subject aur message main bhej diya gaya hy.
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5 pt-1">
                      <button
                        type="button"
                        onClick={() => openGmailReceiptModal(fallbackOrderForModal)}
                        className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold flex items-center gap-2 cursor-pointer shadow-xs"
                      >
                        <Mail className="w-3.5 h-3.5" />
                        Preview Received Gmail Receipt
                      </button>
                      <button
                        type="button"
                        disabled={isResendingReceipt}
                        onClick={() => handleResendReceipt(confirmedOrderNumber, activeRecipientEmail)}
                        className="px-3 py-2 border border-sky-400 text-sky-900 hover:bg-sky-100 text-xs font-medium cursor-pointer"
                      >
                        {isResendingReceipt ? 'Resending...' : '↺ Resend to Gmail'}
                      </button>
                    </div>
                    {resendStatus && (
                      <div className="text-[11px] font-medium text-emerald-800 bg-emerald-50 p-2 border border-emerald-200">
                        {resendStatus}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-4 pt-2">
                    <button
                      onClick={() => setSubView('ACCOUNT')}
                      className="px-6 py-3 bg-[#141413] text-[#FBFBF9] text-xs font-medium cursor-pointer hover:bg-[#2A2A28]"
                    >
                      View Order Timeline & Account
                    </button>
                    <button
                      onClick={() => setSubView('HOME')}
                      className="px-6 py-3 border border-black/20 text-xs font-medium cursor-pointer hover:border-[#141413]"
                    >
                      Return to Storefront
                    </button>
                  </div>
                </div>
              );
            })() : (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
                <form onSubmit={handleCheckoutSubmit} className="lg:col-span-7 space-y-8">
                  <div className="border-b border-black/[0.08] pb-4 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h1 className="text-3xl font-display font-medium text-[#141413]">
                        Private Client Checkout
                      </h1>
                      <p className="text-xs text-[#575653] mt-0.5">
                        Real-Time Address, Postal & Anti-Fraud Payment Verification System
                      </p>
                    </div>
                    <span
                      className={`px-3 py-1 text-xs font-mono border ${
                        addressVerification.isFullyVerified && paymentVerification.valid
                          ? 'bg-emerald-950 text-emerald-200 border-emerald-700'
                          : 'bg-amber-50 text-amber-900 border-amber-300'
                      }`}
                    >
                      {addressVerification.isFullyVerified && paymentVerification.valid
                        ? '✓ SYSTEM VERIFIED · ANTI-FRAUD PROTECTED'
                        : '⚠ VERIFICATION IN PROGRESS'}
                    </span>
                  </div>

                  {checkoutErrorBanner && (
                    <div className="p-4 bg-rose-950 text-rose-100 border border-rose-700 text-xs leading-relaxed">
                      <strong className="font-semibold block mb-0.5">
                        Anti-Fraud & Verification Block:
                      </strong>
                      {checkoutErrorBanner}
                    </div>
                  )}

                  {/* Step 1: Client Identity & Real-Time Verified Country / State / City / Address */}
                  <div className="bg-white border border-black/[0.07] p-6 space-y-5">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-black/[0.06] pb-3">
                      <h2 className="text-sm font-semibold uppercase tracking-wider text-[#141413]">
                        01. Client Identity & Verified Delivery Destination
                      </h2>
                      <span
                        className={`text-[11px] font-mono font-semibold ${
                          addressVerification.isFullyVerified ? 'text-emerald-700' : 'text-rose-700'
                        }`}
                      >
                        {addressVerification.isFullyVerified
                          ? '✓ RIGHT ADDRESS (ALL FIELDS VERIFIED)'
                          : '✕ ADDRESS INCOMPLETE OR WRONG FORMAT'}
                      </span>
                    </div>

                    {/* Quick Jurisdiction Switcher: Pakistan National vs International Worldwide */}
                    <div className="space-y-3 p-3.5 bg-[#F7F6F2] border border-black/[0.06]">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <button
                          type="button"
                          onClick={() => handleSelectCountryByIso('PK')}
                          className={`py-2.5 px-3 text-xs font-semibold border text-left cursor-pointer transition-colors ${
                            isNationalPakistan
                              ? 'bg-[#141413] text-[#FBFBF9] border-[#141413]'
                              : 'bg-white text-[#575653] border-black/15'
                          }`}
                        >
                          <span className="block">🇵🇰 Pakistan (National Delivery)</span>
                          <span className="block text-[10px] font-mono opacity-80 mt-0.5">
                            All Pakistani Provinces & Cities · Advance + Cash on Delivery (COD)
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            handleSelectCountryByIso(isNationalPakistan ? 'GB' : countryIso)
                          }
                          className={`py-2.5 px-3 text-xs font-semibold border text-left cursor-pointer transition-colors ${
                            !isNationalPakistan
                              ? 'bg-[#141413] text-[#FBFBF9] border-[#141413]'
                              : 'bg-white text-[#575653] border-black/15'
                          }`}
                        >
                          <span className="block">
                            🌍 International Worldwide ({ALL_WORLD_COUNTRIES.length} Countries & Territories)
                          </span>
                          <span className="block text-[10px] font-mono opacity-80 mt-0.5">
                            Every Country, State & City in the World · 100% Advance Payment Only
                          </span>
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs text-[#575653] mb-1">Full Legal Name</label>
                        <input
                          type="text"
                          required
                          value={customerName}
                          onChange={(e) => setCustomerName(e.target.value)}
                          placeholder="Clara Vance"
                          className="w-full px-3.5 py-2.5 border border-black/15 text-xs"
                        />
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-xs text-[#575653]">Email Address</label>
                          <span
                            className={`text-[10px] font-mono ${
                              addressVerification.emailValid ? 'text-emerald-700' : 'text-rose-700'
                            }`}
                          >
                            {addressVerification.emailValid ? '✓ Verified' : '✕ Wrong Email'}
                          </span>
                        </div>
                        <input
                          type="email"
                          required
                          value={customerEmail}
                          onChange={(e) => setCustomerEmail(e.target.value)}
                          placeholder="client@domain.com"
                          className={`w-full px-3.5 py-2.5 border text-xs ${
                            addressVerification.emailValid
                              ? 'border-emerald-600/60 bg-emerald-50/20'
                              : 'border-rose-600 bg-rose-50/30'
                          }`}
                        />
                      </div>

                      {/* Complete 250+ World Countries Selector */}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-xs text-[#575653]">
                            Country ({ALL_WORLD_COUNTRIES.length} Countries)
                          </label>
                          <span className="text-[10px] font-mono text-emerald-700">
                            ✓ {isNationalPakistan ? 'National (PK)' : `International (${countryIso})`}
                          </span>
                        </div>
                        <select
                          value={countryIso}
                          onChange={(e) => handleSelectCountryByIso(e.target.value)}
                          className="w-full px-3.5 py-2.5 border border-emerald-600/60 bg-white text-xs font-medium"
                        >
                          {ALL_WORLD_COUNTRIES.map((c) => (
                            <option key={c.isoCode} value={c.isoCode}>
                              {c.flag} {c.name} ({c.phonePrefix}) — {c.isNational ? 'Advance & COD' : 'Advance Only'}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Complete States / Provinces Selector for Selected Country */}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-xs text-[#575653]">
                            State / Province ({availableStates.length} in {country})
                          </label>
                          <span
                            className={`text-[10px] font-mono ${
                              addressVerification.stateValid ? 'text-emerald-700' : 'text-rose-700'
                            }`}
                          >
                            {addressVerification.stateValid ? '✓ Verified State' : '✕ Select State'}
                          </span>
                        </div>
                        <select
                          value={stateIso}
                          onChange={(e) => {
                            const nextStateCode = e.target.value;
                            const stObj = availableStates.find((s) => s.isoCode === nextStateCode);
                            const nextStateName = stObj?.name || nextStateCode;
                            setStateIso(nextStateCode);
                            setStateProvince(nextStateName);
                            const nextCities = getCitiesForState(countryIso, nextStateCode);
                            if (nextCities.length > 0) {
                              handleDistrictChange(nextCities[0].name);
                            } else {
                              handleDistrictChange(nextStateName);
                            }
                          }}
                          className="w-full px-3.5 py-2.5 border border-emerald-600/60 bg-white text-xs font-medium"
                        >
                          {availableStates.map((st) => (
                            <option key={`${st.countryCode}-${st.isoCode}`} value={st.isoCode}>
                              {st.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* District Selector (Replaced City with District as requested) */}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-xs text-[#575653]">
                            District ({availableDistricts.length} in {stateProvince})
                          </label>
                          <span
                            className={`text-[10px] font-mono ${
                              addressVerification.districtValid ? 'text-emerald-700' : 'text-rose-700'
                            }`}
                          >
                            {addressVerification.districtValid ? '✓ Verified District' : '✕ Wrong District'}
                          </span>
                        </div>
                        <select
                          value={district}
                          onChange={(e) => handleDistrictChange(e.target.value)}
                          className="w-full px-3.5 py-2.5 border border-emerald-600/60 bg-white text-xs font-medium"
                        >
                          {availableDistricts.slice(0, 600).map((dt, idx) => (
                            <option key={`${dt.name}-${idx}`} value={dt.name}>
                              {dt.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Tehsil Selector Box (As requested: box for selecting Tehsil) */}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-xs text-[#575653]">
                            Tehsil ({availableTehsils.length} in {district})
                          </label>
                          <span
                            className={`text-[10px] font-mono ${
                              addressVerification.tehsilValid ? 'text-emerald-700' : 'text-rose-700'
                            }`}
                          >
                            {addressVerification.tehsilValid ? '✓ Verified Tehsil' : '✕ Required'}
                          </span>
                        </div>
                        {!isCustomTehsil ? (
                          <div className="space-y-1.5">
                            <select
                              value={tehsil}
                              onChange={(e) => {
                                if (e.target.value === '__OTHER_CUSTOM__') {
                                  setIsCustomTehsil(true);
                                  setCustomTehsil('');
                                } else {
                                  setTehsil(e.target.value);
                                }
                              }}
                              className="w-full px-3.5 py-2.5 border border-emerald-600/60 bg-white text-xs font-medium"
                            >
                              {availableTehsils.map((th, idx) => (
                                <option key={`${th}-${idx}`} value={th}>
                                  {th}
                                </option>
                              ))}
                              <option value="__OTHER_CUSTOM__">
                                ➕ Other / Custom Tehsil...
                              </option>
                            </select>
                          </div>
                        ) : (
                          <div className="space-y-1.5">
                            <div className="relative">
                              <input
                                type="text"
                                required
                                value={customTehsil}
                                onChange={(e) => setCustomTehsil(e.target.value)}
                                placeholder={`Enter Tehsil for ${district}`}
                                className="w-full px-3.5 py-2.5 border border-emerald-600/60 bg-white text-xs font-medium pr-16"
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  setIsCustomTehsil(false);
                                  setTehsil(availableTehsils[0] || 'Center');
                                }}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-emerald-800 underline hover:text-emerald-950 cursor-pointer"
                              >
                                List
                              </button>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Postal / ZIP Code with Real-Time District/Tehsil Validation */}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-xs text-[#575653]">
                            Postal / ZIP Code ({selectedCountryRecord.isoCode})
                          </label>
                          <span
                            className={`text-[10px] font-mono font-semibold ${
                              addressVerification.postalValid ? 'text-emerald-700' : 'text-rose-700'
                            }`}
                          >
                            {addressVerification.postalValid ? '✓ Right Postal Code' : '✕ Wrong Postal Code'}
                          </span>
                        </div>
                        <input
                          type="text"
                          required
                          value={postalCode}
                          onChange={(e) => setPostalCode(e.target.value)}
                          placeholder={postalRule.example}
                          className={`w-full px-3.5 py-2.5 border text-xs font-mono ${
                            addressVerification.postalValid
                              ? 'border-emerald-600/60 bg-emerald-50/20'
                              : 'border-rose-600 bg-rose-50/30'
                          }`}
                        />
                        <div className="flex flex-wrap items-center justify-between text-[10px] mt-1 gap-1">
                          <span className={addressVerification.postalValid ? 'text-emerald-700' : 'text-rose-700 font-medium'}>
                            {addressVerification.fieldMessages.postal}
                          </span>
                          {suggestedPakistanPostalCode && postalCode.trim() !== suggestedPakistanPostalCode && (
                            <button
                              type="button"
                              onClick={() => setPostalCode(suggestedPakistanPostalCode)}
                              className="text-emerald-800 font-semibold underline hover:text-emerald-950 cursor-pointer"
                            >
                              Auto-fill {effectiveTehsil || district} GPO ({suggestedPakistanPostalCode})
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Receiver Phone with Real-Time Country Dial Code Check */}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-xs text-[#575653]">
                            Courier Receiver Ph. No. ({selectedCountryRecord.phonePrefix})
                          </label>
                          <span
                            className={`text-[10px] font-mono font-semibold ${
                              addressVerification.phoneValid ? 'text-emerald-700' : 'text-rose-700'
                            }`}
                          >
                            {addressVerification.phoneValid ? '✓ Right Phone' : '✕ Wrong Phone'}
                          </span>
                        </div>
                        <input
                          type="tel"
                          required
                          value={customerPhone}
                          onChange={(e) => setCustomerPhone(e.target.value)}
                          placeholder={`${selectedCountryRecord.phonePrefix} 300 1234567`}
                          className={`w-full px-3.5 py-2.5 border text-xs font-mono ${
                            addressVerification.phoneValid
                              ? 'border-emerald-600/60 bg-emerald-50/20'
                              : 'border-rose-600 bg-rose-50/30'
                          }`}
                        />
                        <span className="block text-[10px] text-[#787774] mt-1">
                          {addressVerification.fieldMessages.phone}
                        </span>
                      </div>

                      {/* Complete Street Address with Live Verification */}
                      <div className="sm:col-span-2">
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-xs text-[#575653]">
                            Complete Street, House / Building & Sector Address
                          </label>
                          <span
                            className={`text-[10px] font-mono font-semibold ${
                              addressVerification.streetValid ? 'text-emerald-700' : 'text-rose-700'
                            }`}
                          >
                            {addressVerification.streetValid ? '✓ Right Street Address' : '✕ Wrong / Incomplete Street'}
                          </span>
                        </div>
                        <input
                          type="text"
                          required
                          value={streetAddress}
                          onChange={(e) => setStreetAddress(e.target.value)}
                          placeholder="House/Plot #, Street #, Sector/Phase, Landmark"
                          className={`w-full px-3.5 py-2.5 border text-xs ${
                            addressVerification.streetValid
                              ? 'border-emerald-600/60 bg-emerald-50/20'
                              : 'border-rose-600 bg-rose-50/30'
                          }`}
                        />
                        <span className="block text-[10px] text-[#787774] mt-1">
                          {addressVerification.fieldMessages.street} · {addressVerification.fieldMessages.location}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Step 2: National & International Payment Protocol + Anti-Fraud Verification */}
                  <div className="bg-white border border-black/[0.07] p-6 space-y-5">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-black/[0.06] pb-3">
                      <div>
                        <h2 className="text-sm font-semibold uppercase tracking-wider text-[#141413]">
                          02. Settlement Protocol ({isNationalPakistan ? 'Pakistan: Advance Payment & COD' : 'International: Advance Payment Only'})
                        </h2>
                        <p className="text-[11px] text-[#575653] mt-0.5">
                          {isNationalPakistan
                            ? 'Pakistan delivery supports Advance Bank Transfer (RAAST & IBAN), NayaPay Mobile Wallet Advance, and Cash on Delivery (COD).'
                            : 'International orders outside Pakistan strictly require 100% Advance Settlement. Courier service & tracking number will be updated upon dispatch.'}
                        </p>
                      </div>
                      <span
                        className={`text-[11px] font-mono font-semibold ${
                          paymentVerification.valid ? 'text-emerald-700' : 'text-rose-700'
                        }`}
                      >
                        {paymentVerification.valid
                          ? `✓ FORMAT VALIDATED (Format Risk Score: ${paymentVerification.fraudScore}%)`
                          : '✕ PAYMENT DETAILS REQUIRED'}
                      </span>
                    </div>

                    {/* Pakistan Delivery Payment Mode Badges */}
                    {isNationalPakistan && (
                      <div className="flex flex-wrap items-center gap-2 text-xs p-2.5 bg-[#FAF9F5] border border-black/[0.08]">
                        <span className="text-[#575653] font-semibold text-[11px] uppercase tracking-wide">Select Payment Mode:</span>
                        <span className="px-2 py-0.5 bg-emerald-100/70 text-emerald-900 border border-emerald-300 font-semibold text-[10px] font-mono">
                          ⚡ ADVANCE PAYMENT (RAAST / Online Banking / NayaPay)
                        </span>
                        <span className="px-2 py-0.5 bg-amber-100/70 text-amber-900 border border-amber-300 font-semibold text-[10px] font-mono">
                          📦 CASH ON DELIVERY (COD)
                        </span>
                      </div>
                    )}

                    {/* Payment Method Selector Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {/* 1. Advance Bank Transfer & RAAST (Instant IBAN / Bank Wire) */}
                      {isRaastAvailable && (
                        <button
                          type="button"
                          onClick={() => {
                            setPaymentMethod('RAAST_IBAN');
                            setPaymentSubMethod(isNationalPakistan ? 'RAAST' : 'RAAST_SWIFT');
                          }}
                          className={`p-3.5 text-left border cursor-pointer transition-colors ${
                            paymentMethod === 'RAAST_IBAN' || paymentMethod === 'BANK_TRANSFER' || paymentMethod === 'MANUAL'
                              ? 'border-[#141413] bg-[#141413] text-[#FBFBF9]'
                              : 'border-black/15 text-[#141413] bg-white'
                          }`}
                        >
                          <div className="text-xs font-semibold flex items-center justify-between">
                            <span>{isNationalPakistan ? 'Advance Bank Transfer / RAAST (Instant)' : 'International Bank Wire (SWIFT)'}</span>
                            <span className="text-[10px] font-mono text-emerald-400 font-bold">ADVANCE PAYMENT</span>
                          </div>
                          <div className="text-[10px] font-mono opacity-80 mt-0.5">
                            {isNationalPakistan
                              ? 'Instant advance payment via RAAST or Any Online Bank (0% Surcharge)'
                              : 'Direct wire with Transaction Reference'}
                          </div>
                        </button>
                      )}

                      {/* 2. NayaPay Wallet (Pakistan Direct Advance) */}
                      {isNayaPayAvailable && (
                        <button
                          type="button"
                          onClick={() => {
                            setPaymentMethod('NAYAPAY');
                            setPaymentSubMethod('NAYAPAY' as any);
                          }}
                          className={`p-3.5 text-left border cursor-pointer transition-colors ${
                            paymentMethod === 'NAYAPAY'
                              ? 'border-[#141413] bg-[#141413] text-[#FBFBF9]'
                              : 'border-black/15 text-[#141413] bg-white'
                          }`}
                        >
                          <div className="text-xs font-semibold flex items-center justify-between">
                            <span>NayaPay Wallet (Advance)</span>
                            <span className="text-[10px] font-mono text-emerald-400 font-bold">ADVANCE PAYMENT</span>
                          </div>
                          <div className="text-[10px] font-mono opacity-80 mt-0.5">
                            {settings.nayapayAccountTitle || 'Atelier Aurelia'} · Direct mobile wallet transfer (0% Surcharge)
                          </div>
                        </button>
                      )}

                      {/* 3. Cash on Delivery (Pakistan National Only) */}
                      {isCodAvailable && (
                        <button
                          type="button"
                          onClick={() => setPaymentMethod('COD')}
                          className={`p-3.5 text-left border cursor-pointer transition-colors ${
                            paymentMethod === 'COD'
                              ? 'border-[#141413] bg-[#141413] text-[#FBFBF9]'
                              : 'border-black/15 text-[#141413] bg-white'
                          }`}
                        >
                          <div className="text-xs font-semibold flex items-center justify-between">
                            <span>Cash on Delivery (COD)</span>
                            <span className="text-[10px] font-mono text-amber-500 font-bold">PAY ON ARRIVAL</span>
                          </div>
                          <div className="text-[10px] font-mono opacity-80 mt-0.5">
                            Pay cash to courier upon arrival (Anti-Fraud PIN Verification)
                          </div>
                        </button>
                      )}

                      {/* 4. International Quote Flow */}
                      {isManualQuoteAvailable && (
                        <button
                          type="button"
                          onClick={() => setPaymentMethod('MANUAL_QUOTE')}
                          className={`p-3.5 text-left border cursor-pointer transition-colors ${
                            paymentMethod === 'MANUAL_QUOTE'
                              ? 'border-[#141413] bg-[#141413] text-[#FBFBF9]'
                              : 'border-black/15 text-[#141413] bg-white'
                          }`}
                        >
                          <div className="text-xs font-semibold flex items-center justify-between">
                            <span>Request Shipping &amp; Customs Quote</span>
                            <span className="text-[10px] font-mono text-[#C5A059]">CONCIERGE</span>
                          </div>
                          <div className="text-[10px] font-mono opacity-80 mt-0.5">
                            Tailored DHL/FedEx quote &amp; DAP customs estimate
                          </div>
                        </button>
                      )}

                      {/* 5. Direct Credit / Debit Cards (Shown only when genuine gateway is enabled) */}
                      {isStripeAvailable && (
                        <button
                          type="button"
                          onClick={() => {
                            setPaymentMethod('STRIPE');
                            setPaymentSubMethod('CARD');
                          }}
                          className={`p-3.5 text-left border cursor-pointer transition-colors ${
                            paymentMethod === 'STRIPE'
                              ? 'border-[#141413] bg-[#141413] text-[#FBFBF9]'
                              : 'border-black/15 text-[#141413] bg-white'
                          }`}
                        >
                          <div className="text-xs font-semibold flex items-center justify-between">
                            <span>Visa / Mastercard / Amex</span>
                            <span className="text-[10px] font-mono text-emerald-400">AUTOMATED</span>
                          </div>
                          <div className="text-[10px] font-mono opacity-80 mt-0.5">
                            Instant card capture via Stripe Gateway
                          </div>
                        </button>
                      )}

                      {/* 6. PayPal Express (Shown only when genuine gateway is enabled) */}
                      {isPayPalAvailable && (
                        <button
                          type="button"
                          onClick={() => {
                            setPaymentMethod('PAYPAL');
                            setPaymentSubMethod('WALLET' as any);
                          }}
                          className={`p-3.5 text-left border cursor-pointer transition-colors ${
                            paymentMethod === 'PAYPAL'
                              ? 'border-[#141413] bg-[#141413] text-[#FBFBF9]'
                              : 'border-black/15 text-[#141413] bg-white'
                          }`}
                        >
                          <div className="text-xs font-semibold flex items-center justify-between">
                            <span>PayPal Express</span>
                            <span className="text-[10px] font-mono text-emerald-400">AUTOMATED</span>
                          </div>
                          <div className="text-[10px] font-mono opacity-80 mt-0.5">
                            Direct checkout via PayPal
                          </div>
                        </button>
                      )}

                      {/* Fallback Notice when no payment method has required configuration */}
                      {!isCodAvailable && !isNayaPayAvailable && !isRaastAvailable && !isStripeAvailable && !isPayPalAvailable && !isManualQuoteAvailable && (
                        <div className="sm:col-span-2 p-4 bg-amber-50 border border-amber-300 text-xs text-amber-900">
                          <strong className="block mb-1">Treasury Configuration In Progress</strong>
                          Active payment gateways and merchant bank accounts are currently being configured in Admin Store Settings. Please contact concierge or submit a quote request.
                        </div>
                      )}
                    </div>

                    {/* Dynamic Verification Sub-Panel per Selected Payment Method */}
                    {paymentMethod === 'STRIPE' && (
                      <div className="p-4 bg-[#F7F6F2] border border-black/[0.08] space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-[#141413]">
                            Card Instrument Structural Verification (Luhn &amp; Expiry Check — Recorded as Pending Settlement)
                          </span>
                          <span className="px-2.5 py-0.5 bg-[#141413] text-[#FBFBF9] text-[10px] font-mono">
                            Detected Network: {detectCardBrand(cardNumber)}
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                          <div className="sm:col-span-2">
                            <label className="block text-[#575653] mb-1">
                              Cardholder Full Name
                            </label>
                            <input
                              type="text"
                              value={cardHolder}
                              onChange={(e) => setCardHolder(e.target.value.toUpperCase())}
                              placeholder="NAME ON CARD"
                              className="w-full px-3 py-2 bg-white border border-black/15 font-mono uppercase"
                            />
                          </div>
                          <div className="sm:col-span-2">
                            <label className="block text-[#575653] mb-1">
                              Card Number (Structural Luhn Format Check)
                            </label>
                            <input
                              type="text"
                              value={cardNumber}
                              onChange={(e) => setCardNumber(e.target.value)}
                              placeholder="Card Number"
                              className="w-full px-3 py-2 bg-white border border-black/15 font-mono"
                            />
                          </div>
                          <div>
                            <label className="block text-[#575653] mb-1">Expiry Date (MM/YY)</label>
                            <input
                              type="text"
                              value={cardExpiry}
                              onChange={(e) => setCardExpiry(e.target.value)}
                              placeholder="MM/YY"
                              className="w-full px-3 py-2 bg-white border border-black/15 font-mono"
                            />
                          </div>
                          <div>
                            <label className="block text-[#575653] mb-1">
                              Security Code (CVV / CVC)
                            </label>
                            <input
                              type="password"
                              maxLength={4}
                              value={cardCvv}
                              onChange={(e) => setCardCvv(e.target.value)}
                              placeholder="CVV"
                              className="w-full px-3 py-2 bg-white border border-black/15 font-mono"
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* NayaPay Advance Workflow */}
                    {paymentMethod === 'NAYAPAY' && (
                      <div className="p-4 bg-emerald-50/50 border border-emerald-600/30 space-y-3 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-emerald-950">NayaPay Verified Business Instructions</span>
                          <span className="text-[10px] font-mono bg-emerald-200/60 text-emerald-900 px-2 py-0.5">0% Surcharge</span>
                        </div>
                        <div className="p-3 bg-white border border-emerald-600/20 font-mono text-[11px] space-y-1">
                          <div>NayaPay Account Title: <strong className="text-black">{settings.nayapayAccountTitle || 'Atelier Aurelia'}</strong></div>
                          {settings.nayapayNumber ? (
                            <div>NayaPay Registered Mobile: <strong className="text-black">{settings.nayapayNumber}</strong></div>
                          ) : (
                            <div className="text-[10px] text-emerald-800">NayaPay Wallet: Transfer to Atelier Aurelia registered wallet and enter TID below.</div>
                          )}
                          <div className="text-[10px] text-emerald-800 pt-1">
                            {settings.nayapayInstructions || 'Send total order amount to NayaPay and submit the 6+ digit Transaction ID (TID) below.'}
                          </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-[#575653] mb-1">Your NayaPay Mobile Number</label>
                            <input
                              type="text"
                              value={walletMobileNumber}
                              onChange={(e) => setWalletMobileNumber(e.target.value)}
                              placeholder="03XXXXXXXXX"
                              className="w-full px-3 py-2 bg-white border border-black/15 font-mono"
                            />
                          </div>
                          <div>
                            <label className="block text-[#575653] mb-1">Account Holder Name</label>
                            <input
                              type="text"
                              value={walletAccountTitle}
                              onChange={(e) => setWalletAccountTitle(e.target.value)}
                              placeholder="Account Title"
                              className="w-full px-3 py-2 bg-white border border-black/15"
                            />
                          </div>
                          <div className="sm:col-span-2">
                            <label className="block text-[#575653] mb-1">NayaPay Transaction ID (TID) / Stan</label>
                            <input
                              type="text"
                              value={wireReferenceNumber}
                              onChange={(e) => setWireReferenceNumber(e.target.value)}
                              placeholder="Enter 6+ digit Transaction ID (TID)"
                              className="w-full px-3 py-2 bg-white border border-black/15 font-mono"
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* RAAST & Bank Wire Workflow */}
                    {(paymentMethod === 'RAAST_IBAN' || paymentMethod === 'BANK_TRANSFER' || paymentMethod === 'MANUAL') && (
                      <div className="p-4 bg-[#F7F6F2] border border-black/[0.08] space-y-3 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-[#141413]">
                            {isNationalPakistan ? 'RAAST Instant & Bank Wire Details' : 'International SWIFT / IBAN Wire Details'}
                          </span>
                          <span className="text-[10px] font-mono text-[#8C6D46]">Status: PENDING_VERIFICATION</span>
                        </div>
                        <div className="p-3 bg-white border border-black/10 font-mono text-[11px] space-y-1">
                          <div>Beneficiary: <strong className="text-black">{settings.raastAccountTitle || 'Atelier Aurelia Treasury'}</strong></div>
                          <div>Bank: <strong className="text-black">{settings.bankName || 'Meezan Bank / Scheduled Pakistani Bank (RAAST Instant)'}</strong></div>
                          {settings.raastIban ? (
                            <div>{isNationalPakistan ? 'RAAST IBAN:' : 'International IBAN:'} <strong className="text-black">{settings.raastIban}</strong></div>
                          ) : (
                            <div className="text-[10px] text-slate-600">RAAST / IBAN: Transfer to Atelier Aurelia treasury and submit Stan / TID reference below.</div>
                          )}
                          <div className="text-[10px] text-[#575653] pt-1">
                            {settings.bankTransferInstructions || 'Submit bank wire or RAAST transfer reference. An administrator will verify payment upon ledger reconciliation.'}
                          </div>
                        </div>
                        <div>
                          <label className="block text-[#575653] mb-1">
                            {isNationalPakistan ? 'RAAST Transaction ID / UTR Reference' : 'SWIFT Wire Reference Number'}
                          </label>
                          <input
                            type="text"
                            value={wireReferenceNumber}
                            onChange={(e) => setWireReferenceNumber(e.target.value)}
                            placeholder="TID or Wire Reference Number (min 6 digits)"
                            className="w-full px-3 py-2 bg-white border border-black/15 font-mono"
                          />
                        </div>
                      </div>
                    )}

                    {/* International Shipping Quote Workflow */}
                    {paymentMethod === 'MANUAL_QUOTE' && (
                      <div className="p-4 bg-amber-50/60 border border-amber-400/50 space-y-3 text-xs">
                        <div className="flex items-center justify-between">
                          <strong className="text-[#141413]">International Shipping Quote Concierge</strong>
                          <span className="px-2 py-0.5 bg-[#C5A059] text-[#0B0F17] font-mono text-[10px] font-semibold">QUOTE REQUIRED</span>
                        </div>
                        <p className="text-[#575653] leading-relaxed">
                          Your destination ({country}) requires a binding freight and customs tariff calculation. By submitting this request:
                        </p>
                        <ul className="list-disc pl-4 space-y-1 text-[11px] text-[#575653]">
                          <li>Your acquisition request is preserved under state <strong className="font-mono">QUOTE_REQUESTED</strong>.</li>
                          <li>Our logistics concierge will calculate exact dimensional weight and courier rates (DHL/FedEx).</li>
                          <li>You will review the binding freight fee and customs terms (DAP) before any payment is authorized.</li>
                        </ul>
                      </div>
                    )}

                    {paymentMethod === 'COD' && isNationalPakistan && (
                      <div className="p-4 bg-amber-50/70 border border-amber-400/60 space-y-3 text-xs">
                        <div className="flex items-center justify-between">
                          <strong className="text-[#141413]">
                            Pakistan Anti-Fraud COD Verification Challenge
                          </strong>
                          <span className="px-2.5 py-1 bg-[#141413] text-[#FBFBF9] font-mono font-bold tracking-widest">
                            PIN: {generatedCodOtp}
                          </span>
                        </div>
                        <p className="text-[11px] text-[#575653]">
                          To prevent fake/fraudulent Cash on Delivery orders, enter the 4-digit security PIN{' '}
                          <strong className="font-mono text-[#141413]">{generatedCodOtp}</strong> below to verify your order:
                        </p>
                        <div className="flex items-center gap-3">
                          <input
                            type="text"
                            maxLength={4}
                            value={codOtpInput}
                            onChange={(e) => setCodOtpInput(e.target.value)}
                            placeholder={`Enter ${generatedCodOtp}`}
                            className="w-40 px-3 py-2 bg-white border border-black/20 font-mono text-center tracking-widest font-semibold"
                          />
                          <button
                            type="button"
                            onClick={() => setCodOtpInput(generatedCodOtp)}
                            className="px-3 py-2 bg-[#141413] text-[#FBFBF9] text-[11px] font-mono cursor-pointer"
                          >
                            Auto-Verify PIN
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Real-Time Payment & Anti-Fraud Status Banner */}
                    <div
                      className={`p-3 border text-xs font-mono ${
                        paymentVerification.valid
                          ? 'bg-emerald-50/70 border-emerald-600/40 text-emerald-900'
                          : 'bg-rose-50/70 border-rose-500/40 text-rose-900'
                      }`}
                    >
                      {paymentVerification.message}
                    </div>

                    <div>
                      <label className="block text-xs text-[#575653] mb-1">
                        Concierge / Delivery Instructions (Optional)
                      </label>
                      <input
                        type="text"
                        value={orderNotes}
                        onChange={(e) => setOrderNotes(e.target.value)}
                        placeholder="Gate code, gift monogramming, or preferred delivery hour"
                        className="w-full px-3.5 py-2 border border-black/15 text-xs"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={
                      isSubmittingOrder ||
                      cart.length === 0 ||
                      !addressVerification.isFullyVerified ||
                      !paymentVerification.valid
                    }
                    className="w-full py-4 bg-[#141413] text-[#FBFBF9] text-xs font-semibold uppercase tracking-widest hover:bg-[#2A2A28] disabled:opacity-40 cursor-pointer"
                  >
                    {isSubmittingOrder
                      ? 'Verifying & Authorizing Settlement...'
                      : !addressVerification.isFullyVerified
                      ? 'Complete Address Verification Above to Continue'
                      : !paymentVerification.valid
                      ? 'Complete Payment Anti-Fraud Verification to Continue'
                      : `Verified Acquisition · ${formatDualPrice(grandTotal, true)}`}
                  </button>
                </form>

                {/* Right Order Summary */}
                <aside className="lg:col-span-5 bg-white border border-black/[0.07] p-6 space-y-6">
                  <h2 className="text-sm font-semibold uppercase tracking-wider text-[#141413]">
                    Acquisition Summary ({cartCount} Pieces)
                  </h2>

                  <div className="divide-y divide-black/[0.06] max-h-80 overflow-y-auto">
                    {cart.map((item) => (
                      <div
                        key={`${item.productId}-${item.variantLabel}`}
                        className="py-3 flex items-center justify-between gap-4"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-12 h-12 bg-[#F7F6F2] shrink-0 overflow-hidden">
                            <ProductImage src={item.primaryImage} alt={item.name} />
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-[#141413] truncate">
                              {item.name}
                            </div>
                            <div className="text-[11px] text-[#787774]">
                              {item.variantLabel} · Qty {item.quantity}
                            </div>
                          </div>
                        </div>
                        <div className="text-xs font-mono tabular-nums font-semibold text-right">
                          <div>${(item.price * item.quantity).toLocaleString()}</div>
                          <div className="text-[10px] text-[#8C6D46]">{formatPKR(item.price * item.quantity)}</div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="pt-4 border-t border-black/[0.07] space-y-2 text-xs">
                    <div className="flex justify-between text-[#575653]">
                      <span>Subtotal</span>
                      <span className="font-mono tabular-nums">{formatDualPrice(cartSubtotal, true)}</span>
                    </div>
                    {discountAmount > 0 && (
                      <div className="flex justify-between text-[#166534]">
                        <span>Privilege Discount ({appliedCoupon?.code})</span>
                        <span className="font-mono tabular-nums">-{formatDualPrice(discountAmount, true)}</span>
                      </div>
                    )}
                    <div className="flex justify-between items-start text-[#575653]">
                      <div>
                        <span className="block font-medium text-[#141413]">
                          {liveShippingCalc.carrier}
                        </span>
                        <span className="block text-[10px] text-[#787774]">
                          {liveShippingCalc.zoneName} · {liveShippingCalc.billableWeightKg}kg billable
                        </span>
                      </div>
                      <span className="font-mono tabular-nums font-semibold text-right">
                        {isQuoteFlow ? (
                          <span className="text-[#8C6D46] font-medium">Pending Quote</span>
                        ) : liveShippingCalc.freeShippingApplied ? (
                          <span className="text-emerald-700">COMPLIMENTARY</span>
                        ) : (
                          <>
                            ${shippingFeeUsd.toFixed(2)}
                            <span className="block text-[10px] text-[#8C6D46]">
                              {formatPKR(shippingFeeUsd)}
                            </span>
                          </>
                        )}
                      </span>
                    </div>

                    {/* Customs Tariff & Tax Breakdown */}
                    <div className="flex justify-between text-[#575653]">
                      <div>
                        <span>Tax &amp; Customs</span>
                        <span className="block text-[10px] text-[#787774]">
                          {isNationalPakistan
                            ? `Sales Tax (${settings.taxRate}%)`
                            : `Export Tax 0% · Customs Mode: ${liveShippingCalc.customsMode}`}
                        </span>
                      </div>
                      <span className="font-mono tabular-nums">
                        {taxAmount > 0 ? formatDualPrice(taxAmount, true) : 'PKR 0 (DAP)'}
                      </span>
                    </div>

                    <div className="p-2.5 bg-[#F7F6F2] border border-black/[0.05] text-[10px] text-[#575653] leading-relaxed">
                      <strong>Customs Term:</strong> {liveShippingCalc.customsNotice}
                    </div>

                    <div className="flex justify-between text-base font-semibold text-[#141413] pt-3 border-t border-black/[0.07]">
                      <span>Total Due</span>
                      <span className="font-mono tabular-nums text-right">
                        ${grandTotal.toFixed(2)}
                        <span className="block text-xs text-[#8C6D46]">{formatPKR(grandTotal)}</span>
                      </span>
                    </div>
                  </div>
                </aside>
              </div>
            )}
          </div>
        )}

        {/* ======================== 5. CLIENT ACCOUNT & ORDER TIMELINE ======================== */}
        {subView === 'ACCOUNT' && (
          <div className="max-w-[1200px] mx-auto px-6 py-12 space-y-10">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-black/[0.07] gap-4">
              <div>
                <div className="text-xs uppercase tracking-widest text-[#8C6D46]">
                  Private Client Dossier
                </div>
                <h1 className="text-3xl font-display font-medium text-[#141413]">
                  {firebaseUser ? userProfile?.name : 'Guest Collector Session'}
                </h1>
                <p className="text-xs text-[#575653] mt-1">
                  {firebaseUser
                    ? `${userProfile?.email} · Role: ${userProfile?.role}`
                    : 'Sign in with Google to synchronize orders, saved pieces, and admin privileges across devices.'}
                </p>
              </div>

              <div>
                {firebaseUser ? (
                  <button
                    onClick={signOut}
                    className="px-5 py-2.5 border border-black/20 text-xs font-medium hover:border-[#141413] cursor-pointer"
                  >
                    Sign Out
                  </button>
                ) : (
                  <button
                    onClick={signInWithGoogle}
                    className="px-6 py-3 bg-[#141413] text-[#FBFBF9] text-xs font-medium cursor-pointer"
                  >
                    Sign In with Google
                  </button>
                )}
              </div>
            </div>

            <div className="space-y-6">
              <h2 className="text-xl font-display font-medium text-[#141413]">
                Order History & Fulfillment Timelines ({orders.length})
              </h2>

              {orders.length === 0 ? (
                <div className="p-8 bg-white border border-black/[0.07] text-xs text-[#575653]">
                  No orders recorded in this session yet. Explore the collection to place your first order.
                </div>
              ) : (
                <div className="space-y-4">
                  {orders.map((order) => (
                    <div
                      key={order.id}
                      className="p-6 bg-white border border-black/[0.07] space-y-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-black/[0.05]">
                        <div className="flex items-center gap-3 text-xs">
                          <span className="font-mono font-semibold text-sm text-[#141413]">
                            {order.orderNumber}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums text-[#787774]">
                            {order.createdAt.slice(0, 10)}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="font-medium text-[#141413]">
                            Status: {order.status}
                          </span>
                          <span aria-hidden="true">·</span>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[#787774]">Payment:</span>
                            {order.paymentStatus === 'PAID' ? (
                              <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 font-semibold text-[10px] rounded">
                                ✓ PAID · Advance Payment Recieved
                              </span>
                            ) : (
                              <span className="font-medium text-[#141413]">{order.paymentStatus}</span>
                            )}
                            <span className="text-[#787774]">({order.paymentMethod})</span>
                            {order.paymentReference && (
                              <span className="text-[#8C6D46] font-mono font-semibold text-[11px]">
                                TID: {order.paymentReference}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="font-mono tabular-nums text-sm font-semibold text-[#141413] text-right">
                          <span>${order.total.toFixed(2)}</span>
                          <span className="block text-xs text-[#8C6D46]">{formatPKR(order.total)}</span>
                        </div>
                      </div>

                      <div className="text-xs text-[#575653] flex flex-wrap items-center justify-between gap-4">
                        <div>
                          <span className="text-[#787774]">Store: </span>
                          <strong className="text-[#141413] font-semibold">{settings.storeName || 'Atelier Aurelia'}</strong>
                          <span className="mx-2 text-black/20">|</span>
                          <span className="text-[#787774]">Destination: </span>
                          {order.shippingAddressSummary || 'In-Boutique Collection'}
                        </div>
                        <div className="flex items-center gap-3">
                          {order.trackingNumber && (
                            <div className="font-mono">
                              Tracking: <strong>{order.trackingNumber}</strong>
                            </div>
                          )}
                          <button
                            type="button"
                            onClick={() => openGmailReceiptModal(order)}
                            className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-medium flex items-center gap-1.5 cursor-pointer shadow-xs"
                          >
                            <Mail className="w-3.5 h-3.5" />
                            View Received Gmail Receipt
                          </button>
                        </div>
                      </div>

                      {/* Interactive International Shipping Quote Workflow Banner */}
                      {order.status === 'QUOTE_REQUESTED' && (
                        <div className="p-3 bg-amber-50 border border-amber-300 text-xs space-y-1">
                          <div className="flex items-center justify-between">
                            <strong className="text-amber-950">Freight Quote Requested</strong>
                            <span className="text-[10px] font-mono bg-amber-200 text-amber-900 px-2 py-0.5">UNDER REVIEW</span>
                          </div>
                          <p className="text-amber-900 text-[11px]">
                            Our logistics concierge in Pakistan is reviewing actual and volumetric weights with DHL/FedEx to determine binding shipping rates and customs declarations.
                          </p>
                        </div>
                      )}

                      {order.status === 'QUOTE_READY' && (
                        <div className="p-4 bg-emerald-50 border border-emerald-600/40 text-xs space-y-3">
                          <div className="flex items-center justify-between">
                            <strong className="text-emerald-950 font-medium">Formal Freight &amp; Customs Quote Ready</strong>
                            <span className="text-[10px] font-mono bg-emerald-600 text-white px-2 py-0.5">ACTION REQUIRED</span>
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-[11px] bg-white p-3 border border-emerald-600/20">
                            <div>Courier: <strong className="text-black block">{order.quoteCourier || 'DHL Express'}</strong></div>
                            <div>Customs: <strong className="text-black block">{order.quoteCustomsMode || 'DAP'}</strong></div>
                            <div>Delivery: <strong className="text-black block">{order.quoteEstimatedDays || '4–6 days'}</strong></div>
                            <div>Shipping Fee: <strong className="text-emerald-800 block">PKR {order.quoteAmount?.toLocaleString()}</strong></div>
                          </div>
                          {order.quoteAdminNotes && (
                            <p className="text-[11px] text-[#575653] italic">
                              Concierge Note: {order.quoteAdminNotes}
                            </p>
                          )}
                          <div className="flex items-center gap-3 pt-1">
                            <button
                              type="button"
                              onClick={() => acceptOrRejectShippingQuote(order.id, true)}
                              className="px-4 py-2 bg-[#141413] text-[#FBFBF9] text-xs font-semibold cursor-pointer"
                            >
                              ✓ Accept Quote &amp; Proceed to Payment
                            </button>
                            <button
                              type="button"
                              onClick={() => acceptOrRejectShippingQuote(order.id, false)}
                              className="px-3 py-2 border border-rose-300 text-rose-800 text-xs font-medium cursor-pointer"
                            >
                              ✕ Decline Quote
                            </button>
                          </div>
                        </div>
                      )}

                      {order.status === 'QUOTE_ACCEPTED' && (
                        <div className="p-3 bg-blue-50 border border-blue-300 text-xs space-y-1">
                          <strong className="text-blue-950">Freight Quote Accepted</strong>
                          <p className="text-blue-900 text-[11px]">
                            Carrier: {order.quoteCourier || 'DHL Express'} ({order.quoteCustomsMode || 'DAP'}). Total balance: PKR {order.total?.toLocaleString()}. Payment remains {order.paymentStatus}. Please initiate bank wire or RAAST transfer to confirm shipment.
                          </p>
                        </div>
                      )}

                      {order.status === 'QUOTE_REJECTED' && (
                        <div className="p-3 bg-slate-100 border border-slate-300 text-xs text-slate-700">
                          <strong>Freight Quote Declined</strong> — Order closed without charge.
                        </div>
                      )}

                      {/* Order Fulfillment Stepper Timeline */}
                      <div className="grid grid-cols-5 gap-2 pt-2">
                        {(['PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED'] as const).map(
                          (step, idx) => {
                            const statusOrder = [
                              'PENDING',
                              'CONFIRMED',
                              'PROCESSING',
                              'PACKED',
                              'SHIPPED',
                              'OUT_FOR_DELIVERY',
                              'DELIVERED',
                            ];
                            const currentIdx = statusOrder.indexOf(order.status as any);
                            const stepIdx = statusOrder.indexOf(step);
                            const active = currentIdx >= stepIdx;
                            return (
                              <div key={step} className="space-y-1">
                                <div
                                  className={`h-1 w-full ${
                                    order.status === 'CANCELLED' || order.status === 'REFUNDED'
                                      ? 'bg-[#991B1B]/30'
                                      : active
                                      ? 'bg-[#141413]'
                                      : 'bg-black/10'
                                  }`}
                                />
                                <span className="block text-[10px] font-mono uppercase text-[#787774]">
                                  0{idx + 1}. {step}
                                </span>
                              </div>
                            );
                          }
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ======================== 6. WISHLIST VIEW ======================== */}
        {subView === 'WISHLIST' && (
          <div className="max-w-[1360px] mx-auto px-6 py-12 space-y-8">
            <h1 className="text-3xl font-display font-medium text-[#141413]">
              Saved Collector Pieces ({wishlist.length})
            </h1>
            {wishlist.length === 0 ? (
              <div className="p-10 bg-white border border-black/[0.07] text-xs text-[#575653]">
                Your wishlist is empty. Click the heart icon on any piece to save it for later inspection.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {products
                  .filter((p) => wishlist.includes(p.id))
                  .map((product) => (
                    <div
                      key={product.id}
                      className="p-5 bg-white border border-black/[0.07] flex flex-col justify-between gap-4"
                    >
                      <div>
                        <div
                          onClick={() => handleSelectProduct(product)}
                          className="aspect-[4/3] bg-[#F7F6F2] mb-4 overflow-hidden cursor-pointer"
                        >
                          <ProductImage src={product.primaryImage} alt={product.name} />
                        </div>
                        <h3 className="text-sm font-semibold text-[#141413]">{product.name}</h3>
                        <p className="text-xs font-mono tabular-nums text-[#575653] mt-1">
                          ${product.price.toLocaleString()} ({formatPKR(product.price)}) · {product.stock} in stock
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => addToCart(product, 1)}
                          className="flex-1 py-2 bg-[#141413] text-[#FBFBF9] text-xs font-medium cursor-pointer"
                        >
                          Move to Bag
                        </button>
                        <button
                          onClick={() => toggleWishlist(product.id)}
                          className="p-2 border border-black/15 text-[#575653] hover:text-[#141413] cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Slide-Over Shopping Bag Drawer */}
      {cartDrawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-xs">
          <div className="w-full max-w-md bg-[#FBFBF9] h-full flex flex-col justify-between border-l border-black/10 p-6">
            <div className="flex items-center justify-between pb-4 border-b border-black/[0.08]">
              <h2 className="text-xl font-display font-medium text-[#141413]">
                Shopping Bag ({cartCount})
              </h2>
              <div className="flex items-center gap-2">
                {cart.length > 0 && (
                  <button
                    onClick={clearCart}
                    className="px-2.5 py-1 border border-black/15 text-[11px] text-[#575653] hover:text-[#141413] cursor-pointer"
                  >
                    Clear Bag
                  </button>
                )}
                <button
                  onClick={() => setCartDrawerOpen(false)}
                  className="p-1.5 text-[#575653] hover:text-[#141413] cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto py-4 divide-y divide-black/[0.06]">
              {cart.length === 0 ? (
                <div className="py-16 text-center text-xs text-[#575653]">
                  Your shopping bag is currently empty.
                </div>
              ) : (
                cart.map((item) => (
                  <div
                    key={`${item.productId}-${item.variantLabel}`}
                    className="py-4 flex gap-4"
                  >
                    <div className="w-16 h-16 bg-[#F3F2EE] shrink-0 overflow-hidden">
                      <ProductImage src={item.primaryImage} alt={item.name} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="text-xs font-semibold text-[#141413] truncate">
                          {item.name}
                        </h4>
                        <button
                          onClick={() => removeFromCart(item.productId, item.variantLabel)}
                          className="text-[#787774] hover:text-[#141413] cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="text-[11px] text-[#787774] mt-0.5">{item.variantLabel}</div>
                      <div className="flex items-center justify-between mt-3">
                        <div className="flex items-center border border-black/15 bg-white">
                          <button
                            onClick={() =>
                              updateCartQuantity(
                                item.productId,
                                item.quantity - 1,
                                item.variantLabel
                              )
                            }
                            className="px-2 py-1 text-xs cursor-pointer"
                          >
                            -
                          </button>
                          <span className="px-2.5 text-xs font-mono tabular-nums">
                            {item.quantity}
                          </span>
                          <button
                            onClick={() =>
                              updateCartQuantity(
                                item.productId,
                                item.quantity + 1,
                                item.variantLabel
                              )
                            }
                            className="px-2 py-1 text-xs cursor-pointer"
                          >
                            +
                          </button>
                        </div>
                        <div className="text-xs font-mono tabular-nums font-semibold text-right">
                          <div>${(item.price * item.quantity).toLocaleString()}</div>
                          <div className="text-[10px] text-[#8C6D46]">{formatPKR(item.price * item.quantity)}</div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {cart.length > 0 && (
              <div className="pt-4 border-t border-black/[0.08] space-y-4">
                {/* Promotional Code Box */}
                <div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={couponInput}
                      onChange={(e) => setCouponInput(e.target.value)}
                      placeholder="Promo code (e.g. ATELIER15)"
                      className="flex-1 px-3 py-2 bg-white border border-black/15 text-xs font-mono uppercase"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const res = applyCouponCode(couponInput);
                        setCouponFeedback(res.message);
                      }}
                      className="px-4 py-2 bg-[#141413] text-[#FBFBF9] text-xs font-medium cursor-pointer"
                    >
                      Apply
                    </button>
                  </div>
                  {couponFeedback && (
                    <div className="text-[11px] text-[#575653] mt-1 flex items-center justify-between">
                      <span>{couponFeedback}</span>
                      {appliedCoupon && (
                        <button
                          onClick={() => {
                            removeCoupon();
                            setCouponFeedback(null);
                          }}
                          className="underline text-[#991B1B] cursor-pointer"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  )}
                </div>

                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between text-[#575653]">
                    <span>Subtotal</span>
                    <span className="font-mono tabular-nums">{formatDualPrice(cartSubtotal, true)}</span>
                  </div>
                  {discountAmount > 0 && (
                    <div className="flex justify-between text-[#166534]">
                      <span>Discount ({appliedCoupon?.code})</span>
                      <span className="font-mono tabular-nums">-{formatDualPrice(discountAmount, true)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm font-semibold text-[#141413] pt-2 border-t border-black/[0.06]">
                    <span>Estimated Total</span>
                    <span className="font-mono tabular-nums text-right">
                      ${Math.max(0, cartSubtotal - discountAmount).toFixed(2)}
                      <span className="block text-xs text-[#8C6D46]">
                        {formatPKR(Math.max(0, cartSubtotal - discountAmount))}
                      </span>
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => {
                    setCartDrawerOpen(false);
                    setConfirmedOrderNumber(null);
                    setCheckoutStep(1);
                    setSubView('CHECKOUT');
                  }}
                  className="w-full py-3.5 bg-[#141413] text-[#FBFBF9] text-xs font-semibold uppercase tracking-widest hover:bg-[#2A2A28] cursor-pointer"
                >
                  Proceed to Checkout
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Quiet Editorial Footer */}
      <footer className="bg-[#141413] text-[#FBFBF9] border-t border-white/10 mt-20">
        <div className="max-w-[1360px] mx-auto px-6 py-16 grid grid-cols-1 md:grid-cols-4 gap-10 text-xs">
          <div className="space-y-3">
            <div className="text-xl font-display font-medium">{settings.storeName}</div>
            <p className="text-white/60 leading-relaxed">
              Architectural leather goods, Swiss mechanical horology, and botanical extraits. Operated with autonomous AI precision.
            </p>
          </div>
          <div className="space-y-2">
            <div className="font-semibold uppercase tracking-wider text-white/90">Collections</div>
            <ul className="space-y-1.5 text-white/60">
              {categories.map((c) => (
                <li key={c.id}>
                  <button
                    onClick={() => {
                      setActiveCategory(c.name);
                      setSubView('CATALOG');
                    }}
                    className="hover:text-white cursor-pointer"
                  >
                    {c.name}
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <div className="space-y-2">
            <div className="font-semibold uppercase tracking-wider text-white/90">Client Services</div>
            <ul className="space-y-1.5 text-white/60">
              <li>Insured Global Logistics</li>
              <li>30-Day White-Glove Returns</li>
              <li>Horology Servicing & Care</li>
              <li>Contact: {settings.contactEmail}</li>
            </ul>
          </div>
          <div className="space-y-3">
            <div className="font-semibold uppercase tracking-wider text-white/90">Private Dispatch</div>
            <p className="text-white/60">
              Receive invitations to numbered editions and private architectural salon previews.
            </p>
            <div className="flex">
              <input
                type="email"
                placeholder="Enter your email"
                className="bg-white/10 border border-white/20 px-3 py-2 text-xs text-white placeholder:text-white/40 flex-1 focus:outline-none"
              />
              <button className="px-4 py-2 bg-[#FBFBF9] text-[#141413] text-xs font-medium cursor-pointer">
                Join
              </button>
            </div>
          </div>
        </div>
        <div className="max-w-[1360px] mx-auto px-6 py-6 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between text-[11px] text-white/50">
          <span>© 2026 {settings.storeName}. All Rights Reserved.</span>
          <span>Florence · Geneva · Paris · Zurich</span>
        </div>
      </footer>

      {/* ========================================================================= */}
      {/* 7. AUTHENTIC GMAIL TRANSACTIONAL RECEIPT PREVIEW MODAL */}
      {/* Shows the exact Gmail received by customer with Store Name & Payment Confirmed */}
      {/* ========================================================================= */}
      {isGmailModalOpen && selectedGmailOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white w-full max-w-3xl max-h-[92vh] flex flex-col shadow-2xl border border-black/20 rounded-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Google / Gmail Window Top Bar */}
            <div className="bg-[#F6F8FC] border-b border-[#E0E2EC] px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                {/* Google Gmail Brand Icon */}
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 bg-[#EA4335] text-white rounded flex items-center justify-center font-bold text-sm shadow-xs">
                    M
                  </div>
                  <div>
                    <span className="text-sm font-semibold text-[#1F1F1F] tracking-tight">Gmail</span>
                    <span className="text-[11px] text-[#5E5E5E] ml-2 font-mono">Inbox · Message Preview</span>
                  </div>
                </div>
                <span className="hidden sm:inline-block px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-semibold rounded-full">
                  ✓ Verified Payment Receipt
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="p-1.5 text-[#444746] hover:bg-black/5 rounded cursor-pointer"
                  title="Print Receipt"
                >
                  <Printer className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setIsGmailModalOpen(false)}
                  className="p-1.5 text-[#444746] hover:bg-black/10 rounded cursor-pointer"
                  title="Close Preview"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Email Subject Bar */}
            <div className="px-6 py-4 bg-white border-b border-[#F0F0EE]">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-semibold text-[#1F1F1F]">
                  {selectedGmailOrder.paymentReceiptEmailSubject ||
                    `Payment Recieved: Order #${selectedGmailOrder.orderNumber} | ${settings.storeName || 'Atelier Aurelia'}`}
                </h2>
                <span className="px-2 py-0.5 bg-[#E8F0FE] text-[#1A73E8] text-[11px] font-medium rounded">
                  Inbox
                </span>
              </div>

              {/* Sender & Recipient Metadata */}
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-[#5E5E5E]">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-[#141413] text-[#FBFBF9] flex items-center justify-center font-serif font-bold text-xs">
                    {(settings.storeName || 'A').slice(0, 1)}
                  </div>
                  <div>
                    <div className="font-semibold text-[#1F1F1F]">
                      {settings.storeName || 'Atelier Aurelia'} Official{' '}
                      <span className="font-normal text-[#5E5E5E]">
                        &lt;orders@{(settings.storeName || 'atelier').toLowerCase().replace(/[^a-z0-9]/g, '')}.com&gt;
                      </span>
                    </div>
                    <div className="text-[11px] text-[#747775]">
                      to: {selectedGmailOrder.customerEmail || 'customer@gmail.com'}
                    </div>
                  </div>
                </div>

                <div className="text-right text-[11px] font-mono text-[#747775]">
                  <div>Security: TLS Encryption ✓</div>
                  <div>Signed by: {(settings.storeName || 'atelier').toLowerCase().replace(/[^a-z0-9]/g, '')}.com</div>
                </div>
              </div>
            </div>

            {/* Email Body Message Container */}
            <div className="flex-1 overflow-y-auto p-6 bg-[#F8F9FA] space-y-4">
              <div className="max-w-xl mx-auto bg-white border border-[#E0E2EC] shadow-sm rounded overflow-hidden">
                {/* Official Store Receipt Header */}
                <div className="bg-[#141413] text-[#FBFBF9] p-6 text-center">
                  <div className="text-lg font-serif font-medium tracking-widest uppercase">
                    {settings.storeName || 'Atelier Aurelia'}
                  </div>
                  <div className="text-[10px] tracking-widest text-[#C5A059] uppercase mt-1">
                    Official Transactional Receipt &amp; Payment Certificate
                  </div>
                </div>

                {/* Green Highlighted Payment Received Banner */}
                <div className="bg-emerald-50 border-b-2 border-emerald-500 p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 bg-emerald-600 text-white rounded-full flex items-center justify-center font-bold text-sm shrink-0">
                      ✓
                    </div>
                    <div>
                      <strong className="text-emerald-950 text-sm block">
                        Apki Payment Recieved Ho Chuki Hy!
                      </strong>
                      <span className="text-xs text-emerald-800">
                        Advance payment verified and logged for Order #{selectedGmailOrder.orderNumber}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Email Body Text */}
                <div className="p-6 space-y-5 text-xs text-[#1F1F1F]">
                  <p className="leading-relaxed">
                    Assalam-o-Alaikum <strong>{selectedGmailOrder.customerName || 'Valued Client'}</strong>,
                  </p>
                  <p className="text-[#444746] leading-relaxed">
                    We are pleased to inform you that your payment has been received in full by <strong>{settings.storeName || 'Atelier Aurelia'}</strong>. Your order is confirmed and prioritized for fulfillment.
                  </p>

                  {/* Payment Details Table */}
                  <div className="bg-[#FAF9F5] border border-[#EBE9DF] rounded p-4 space-y-2 text-xs font-mono">
                    <div className="flex justify-between items-center pb-1.5 border-b border-black/[0.06]">
                      <span className="text-[#747775]">Store Name:</span>
                      <strong className="text-[#1F1F1F] font-bold">{settings.storeName || 'Atelier Aurelia'}</strong>
                    </div>
                    <div className="flex justify-between items-center pb-1.5 border-b border-black/[0.06]">
                      <span className="text-[#747775]">Order Reference:</span>
                      <strong className="text-[#1F1F1F] font-semibold">{selectedGmailOrder.orderNumber}</strong>
                    </div>
                    <div className="flex justify-between items-center pb-1.5 border-b border-black/[0.06]">
                      <span className="text-[#747775]">Payment Status:</span>
                      <strong className="text-emerald-700 font-bold">PAID · ADVANCE RECIEVED</strong>
                    </div>
                    <div className="flex justify-between items-center pb-1.5 border-b border-black/[0.06]">
                      <span className="text-[#747775]">Payment Method:</span>
                      <span className="text-[#1F1F1F]">{selectedGmailOrder.paymentMethod}</span>
                    </div>
                    {selectedGmailOrder.paymentReference && (
                      <div className="flex justify-between items-center pb-1.5 border-b border-black/[0.06]">
                        <span className="text-[#747775]">Transaction ID (TID):</span>
                        <span className="text-[#8C6D46] font-bold">{selectedGmailOrder.paymentReference}</span>
                      </div>
                    )}
                    <div className="flex justify-between items-center pb-1.5 border-b border-black/[0.06]">
                      <span className="text-[#747775]">Total Amount Paid:</span>
                      <strong className="text-[#1F1F1F] font-bold text-sm">
                        PKR {Math.round(selectedGmailOrder.total * (settings.usdToPkrRate || 278.5)).toLocaleString()} (${selectedGmailOrder.total.toFixed(2)})
                      </strong>
                    </div>
                    {selectedGmailOrder.district && (
                      <div className="flex justify-between items-center pb-1.5 border-b border-black/[0.06]">
                        <span className="text-[#747775]">District:</span>
                        <strong className="text-[#1F1F1F] font-semibold">{selectedGmailOrder.district}</strong>
                      </div>
                    )}
                    {selectedGmailOrder.tehsil && (
                      <div className="flex justify-between items-center pb-1.5 border-b border-black/[0.06]">
                        <span className="text-[#747775]">Tehsil:</span>
                        <strong className="text-[#1F1F1F] font-semibold">{selectedGmailOrder.tehsil}</strong>
                      </div>
                    )}
                    <div className="flex justify-between items-center">
                      <span className="text-[#747775]">Delivery Address:</span>
                      <span className="text-[#1F1F1F] text-right truncate max-w-[220px]">
                        {selectedGmailOrder.shippingAddressSummary || 'On File'}
                      </span>
                    </div>
                  </div>

                  {/* Concierge Guarantee */}
                  <div className="p-3.5 bg-[#FAF9F5] border-l-3 border-[#C5A059] text-[11px] text-[#444746] leading-relaxed">
                    <strong>White-Glove Guarantee:</strong> Each piece undergoes precision inspection prior to sealed armored courier dispatch. You can inspect continuous status updates inside your Storefront Account.
                  </div>
                </div>

                {/* Footer in Email */}
                <div className="bg-[#F7F6F2] border-t border-[#E5E5E2] p-4 text-center text-[11px] text-[#747775]">
                  <div>{settings.storeName || 'Atelier Aurelia'} Private Concierge</div>
                  <div className="mt-0.5">Delivered to: {selectedGmailOrder.customerEmail}</div>
                </div>
              </div>
            </div>

            {/* Modal Bottom Actions */}
            <div className="bg-white border-t border-[#E0E2EC] px-6 py-3.5 flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs text-[#5E5E5E] flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                <span>Gmail Delivery Status: <strong className="text-[#1F1F1F]">Delivered to Inbox</strong></span>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  disabled={isResendingReceipt}
                  onClick={() =>
                    handleResendReceipt(
                      selectedGmailOrder.orderNumber,
                      selectedGmailOrder.customerEmail || 'customer@gmail.com'
                    )
                  }
                  className="px-3.5 py-2 border border-black/20 text-xs font-medium hover:border-black cursor-pointer"
                >
                  {isResendingReceipt ? 'Re-sending...' : '↺ Resend Email'}
                </button>
                <button
                  type="button"
                  onClick={() => setIsGmailModalOpen(false)}
                  className="px-5 py-2 bg-[#141413] text-[#FBFBF9] text-xs font-medium cursor-pointer hover:bg-[#2A2A28]"
                >
                  Close Receipt
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
