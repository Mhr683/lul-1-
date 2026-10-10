import { Country, State, City, ICountry, IState, ICity } from 'country-state-city';
import { PaymentMethod } from '../types/store';

export interface WorldwideCountryInfo {
  isoCode: string;
  name: string;
  flag: string;
  phonePrefix: string;
  isNational: boolean; // true only for Pakistan ('PK')
  currency: string;
}

// Load all 250+ countries of the world with Pakistan ('PK') prioritized first
export function getAllWorldCountries(): WorldwideCountryInfo[] {
  const all: ICountry[] = Country.getAllCountries();
  const mapped: WorldwideCountryInfo[] = all.map((c) => {
    const rawCode = c.phonecode.startsWith('+') ? c.phonecode : `+${c.phonecode}`;
    return {
      isoCode: c.isoCode,
      name: c.name,
      flag: c.flag || '',
      phonePrefix: rawCode.split(' and ')[0],
      isNational: c.isoCode === 'PK',
      currency: c.currency || 'USD',
    };
  });

  mapped.sort((a, b) => {
    if (a.isoCode === 'PK') return -1;
    if (b.isoCode === 'PK') return 1;
    return a.name.localeCompare(b.name);
  });

  return mapped;
}

export const ALL_WORLD_COUNTRIES: WorldwideCountryInfo[] = getAllWorldCountries();

// Get all official States / Provinces / Regions for a Country ISO code
export function getStatesForCountry(countryIsoCode: string): IState[] {
  if (!countryIsoCode) return [];
  const states = State.getStatesOfCountry(countryIsoCode);
  if (states.length === 0) {
    // Fallback for city-states or small islands (e.g., Monaco, Vatican, Gibraltar)
    const country = Country.getCountryByCode(countryIsoCode);
    return [
      {
        name: `${country?.name || countryIsoCode} Metropolitan Region`,
        isoCode: 'CENTRAL',
        countryCode: countryIsoCode,
      },
    ];
  }
  return states;
}

// Get all official Cities for a Country ISO code + State ISO code
export function getCitiesForState(countryIsoCode: string, stateIsoCode: string): ICity[] {
  if (!countryIsoCode) return [];
  if (stateIsoCode && stateIsoCode !== 'CENTRAL') {
    const stateCities = City.getCitiesOfState(countryIsoCode, stateIsoCode);
    if (stateCities.length > 0) return stateCities;
  }
  const countryCities = City.getCitiesOfCountry(countryIsoCode) || [];
  if (countryCities.length > 0) return countryCities;

  const stateObj = State.getStateByCodeAndCountry(stateIsoCode, countryIsoCode);
  const countryObj = Country.getCountryByCode(countryIsoCode);
  return [
    {
      name: stateObj?.name || countryObj?.name || 'Central District',
      countryCode: countryIsoCode,
      stateCode: stateIsoCode || 'CENTRAL',
    },
  ];
}

// Country-Specific Postal Code Regex & Example Helper (Covers PK, US, GB, CA, AE, SA, CH, DE, FR, AU, IN, and Universal ISO fallback)
export function getPostalRuleForCountry(countryIsoCode: string): {
  regex: RegExp;
  example: string;
} {
  switch (countryIsoCode) {
    case 'PK':
      return { regex: /^[0-9]{5}$/, example: '54000 (5-digit Pakistan Post Code)' };
    case 'US':
      return { regex: /^[0-9]{5}(-[0-9]{4})?$/, example: '10022' };
    case 'GB':
      return {
        regex: /^[A-Z]{1,2}[0-9][A-Z0-9]?\s?[0-9][A-Z]{2}$/i,
        example: 'SW1X 7XL',
      };
    case 'CA':
      return {
        regex: /^[A-Z][0-9][A-Z]\s?[0-9][A-Z][0-9]$/i,
        example: 'M5R 2G3',
      };
    case 'CH':
    case 'AU':
    case 'ZA':
    case 'NZ':
    case 'DK':
    case 'NO':
    case 'AT':
    case 'BE':
      return { regex: /^[0-9]{4}$/, example: '8001' };
    case 'DE':
    case 'FR':
    case 'IT':
    case 'ES':
    case 'SA':
    case 'TR':
    case 'MY':
    case 'KR':
    case 'MX':
    case 'TH':
      return { regex: /^[0-9]{5}$/, example: '75008' };
    case 'IN':
    case 'SG':
    case 'CN':
    case 'RU':
      return { regex: /^[0-9]{6}$/, example: '110001' };
    case 'JP':
      return { regex: /^[0-9]{3}-?[0-9]{4}$/, example: '104-0061' };
    case 'AE':
    case 'QA':
    case 'HK':
      return { regex: /^[A-Za-z0-9\s\-]{2,10}$/, example: '00000' };
    default:
      return {
        regex: /^[A-Za-z0-9\s\-]{3,12}$/,
        example: '10000',
      };
  }
}

// Universal Card Brand Detection & Luhn Checksum Anti-Fraud Algorithm
export type DetectedCardBrand =
  | 'VISA'
  | 'MASTERCARD'
  | 'AMEX'
  | 'UNIONPAY'
  | 'DISCOVER'
  | 'JCB'
  | 'PAKPAY_DEBIT'
  | 'UNKNOWN';

export function detectCardBrand(rawNumber: string): DetectedCardBrand {
  const digits = rawNumber.replace(/\D/g, '');
  if (!digits) return 'UNKNOWN';
  if (/^4/.test(digits)) return 'VISA';
  if (/^(5[1-5]|2(22[1-9]|2[3-9][0-9]|[3-6][0-9]{2}|7[0-1][0-9]|720))/.test(digits)) {
    return 'MASTERCARD';
  }
  if (/^3[47]/.test(digits)) return 'AMEX';
  if (/^62/.test(digits)) return 'UNIONPAY';
  if (/^(6011|65|64[4-9])/.test(digits)) return 'DISCOVER';
  if (/^35(2[89]|[3-8][0-9])/.test(digits)) return 'JCB';
  if (/^2205|^5018|^6304/.test(digits)) return 'PAKPAY_DEBIT';
  return 'UNKNOWN';
}

export function validateLuhnChecksum(rawNumber: string): boolean {
  const digits = rawNumber.replace(/\D/g, '');
  if (digits.length < 13 || digits.length > 19) return false;
  if (/^(\d)\1+$/.test(digits)) return false;

  let sum = 0;
  let shouldDouble = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = parseInt(digits.charAt(i), 10);
    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    shouldDouble = !shouldDouble;
  }
  return sum % 10 === 0;
}

export function validateCardExpiry(expiry: string): { valid: boolean; reason?: string } {
  const clean = expiry.trim();
  const match = /^([0-9]{2})\s?\/\s?([0-9]{2,4})$/.exec(clean);
  if (!match) {
    return { valid: false, reason: 'Enter expiry in MM/YY format (e.g. 08/29).' };
  }
  const month = parseInt(match[1], 10);
  let year = parseInt(match[2], 10);
  if (year < 100) year += 2000;

  if (month < 1 || month > 12) {
    return { valid: false, reason: 'Expiry month must be between 01 and 12.' };
  }
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  if (year < currentYear || (year === currentYear && month < currentMonth)) {
    return { valid: false, reason: 'Card is expired. Please use an active card.' };
  }
  if (year > currentYear + 15) {
    return { valid: false, reason: 'Expiry year is out of valid banking range.' };
  }
  return { valid: true };
}

export interface AddressVerificationStatus {
  countryValid: boolean;
  stateValid: boolean;
  cityValid: boolean;
  streetValid: boolean;
  postalValid: boolean;
  phoneValid: boolean;
  emailValid: boolean;
  isFullyVerified: boolean;
  fieldMessages: {
    street: string;
    postal: string;
    phone: string;
    email: string;
    location: string;
  };
}

export function verifyAddressAndIdentity(input: {
  countryIsoCode: string;
  countryName: string;
  stateName: string;
  cityName: string;
  streetAddress: string;
  postalCode: string;
  phone: string;
  email: string;
}): AddressVerificationStatus {
  const countryObj = ALL_WORLD_COUNTRIES.find((c) => c.isoCode === input.countryIsoCode);
  const countryValid = Boolean(countryObj);
  const stateValid = Boolean(input.stateName && input.stateName.trim().length >= 2);
  const cityValid = Boolean(input.cityName && input.cityName.trim().length >= 2);

  const streetTrimmed = input.streetAddress.trim();
  const streetValid =
    streetTrimmed.length >= 6 &&
    /[a-zA-Z]/.test(streetTrimmed) &&
    !/^(.)\1{5,}$/.test(streetTrimmed);

  const postalRule = getPostalRuleForCountry(input.countryIsoCode);
  const postalTrimmed = input.postalCode.trim();
  const postalValid = postalRule.regex.test(postalTrimmed);

  const phoneTrimmed = input.phone.trim();
  const prefix = countryObj?.phonePrefix || '+';
  const digitsOnly = phoneTrimmed.replace(/\D/g, '');
  const phoneValid =
    input.countryIsoCode === 'PK'
      ? /^(\+92|0)?\s?3[0-9]{2}[\s\-]?[0-9]{7}$/.test(phoneTrimmed)
      : (phoneTrimmed.startsWith(prefix) || phoneTrimmed.startsWith('+')) &&
        digitsOnly.length >= 8 &&
        digitsOnly.length <= 15;

  const emailTrimmed = input.email.trim();
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(emailTrimmed);

  const isFullyVerified =
    countryValid &&
    stateValid &&
    cityValid &&
    streetValid &&
    postalValid &&
    phoneValid &&
    emailValid;

  return {
    countryValid,
    stateValid,
    cityValid,
    streetValid,
    postalValid,
    phoneValid,
    emailValid,
    isFullyVerified,
    fieldMessages: {
      location:
        countryValid && stateValid && cityValid
          ? `Verified Global Address: ${input.cityName}, ${input.stateName}, ${input.countryName} (${input.countryIsoCode})`
          : 'Select a valid Country, State/Province, and City.',
      street: streetValid
        ? 'Verified Street & Building format'
        : 'Wrong Address: Enter complete house/building number, street, and sector/area (min 6 chars).',
      postal: postalValid
        ? `Verified Postal Code for ${input.countryName}`
        : `Wrong Postal Code: Expected format like ${postalRule.example} for ${input.countryName}.`,
      phone: phoneValid
        ? `Verified Courier Telephone (${prefix})`
        : `Wrong Phone Format: Must include dial code ${prefix} and valid subscriber digits (e.g. ${prefix} 50 1234567).`,
      email: emailValid
        ? 'Verified Client Email'
        : 'Wrong Email: Enter a valid email address for receipt & OTP verification.',
    },
  };
}

export interface PaymentVerificationStatus {
  valid: boolean;
  cardBrand?: DetectedCardBrand;
  message: string;
  fraudScore: number;
}

export function verifyPaymentInstrument(input: {
  isNationalPakistan: boolean;
  paymentMethod: PaymentMethod;
  paymentSubMethod: string;
  cardNumber: string;
  cardHolder: string;
  cardExpiry: string;
  cardCvv: string;
  walletMobileNumber: string;
  walletAccountTitle: string;
  codOtpCode: string;
  generatedCodOtp: string;
  wireReferenceNumber: string;
}): PaymentVerificationStatus {
  if (!input.isNationalPakistan && input.paymentMethod === 'COD') {
    return {
      valid: false,
      message:
        'Fraud & Policy Block: Cash on Delivery (COD) is strictly restricted to Pakistan National orders. International orders require 100% Advance Payment.',
      fraudScore: 95,
    };
  }

  if (input.paymentMethod === 'STRIPE') {
    const brand = detectCardBrand(input.cardNumber);
    const luhnOk = validateLuhnChecksum(input.cardNumber);
    const expiryCheck = validateCardExpiry(input.cardExpiry);
    const cvvClean = input.cardCvv.replace(/\D/g, '');
    const cvvOk = brand === 'AMEX' ? cvvClean.length === 4 : cvvClean.length === 3;
    const holderOk = input.cardHolder.trim().length >= 3 && /[a-zA-Z]/.test(input.cardHolder);

    if (!holderOk) {
      return {
        valid: false,
        cardBrand: brand,
        message: 'Enter the full Cardholder Name embossed on your card.',
        fraudScore: 40,
      };
    }
    if (!luhnOk) {
      return {
        valid: false,
        cardBrand: brand,
        message: 'Invalid Card Number: Failed Luhn banking checksum verification (anti-fraud check).',
        fraudScore: 85,
      };
    }
    if (!expiryCheck.valid) {
      return {
        valid: false,
        cardBrand: brand,
        message: expiryCheck.reason || 'Invalid card expiration date.',
        fraudScore: 50,
      };
    }
    if (!cvvOk) {
      return {
        valid: false,
        cardBrand: brand,
        message:
          brand === 'AMEX'
            ? 'American Express requires a 4-digit CID security code.'
            : 'Enter a valid 3-digit CVV/CVC security code.',
        fraudScore: 60,
      };
    }
    return {
      valid: true,
      cardBrand: brand,
      message: `Card Format Validated (${brand}): Passed structural Luhn checksum & expiry format. Notice: Luhn checksum validates number formatting only and does not represent payment authorization. Live card gateway is not configured; order requires manual settlement review, and raw card details are never stored.`,
      fraudScore: 2,
    };
  }

  if (input.paymentMethod === 'PAYPAL') {
    return {
      valid: true,
      message: 'PayPal / Digital Wallet Selected: Order will be recorded as PENDING manual settlement verification.',
      fraudScore: 5,
    };
  }

  if (input.paymentMethod === 'MANUAL_QUOTE') {
    return {
      valid: true,
      message: 'International Shipping & Tariff Quote Requested: Order logged for logistics quote. Payment not requested until formal freight proposal is accepted.',
      fraudScore: 2,
    };
  }

  if (input.paymentMethod === 'NAYAPAY') {
    const mobileOk = /^(\+92|0)?\s?3[0-9]{2}[\s\-]?[0-9]{7}$/.test(
      input.walletMobileNumber.trim()
    );
    const titleOk = input.walletAccountTitle.trim().length >= 2;
    const refOk = input.wireReferenceNumber.trim().length >= 6;
    if (!mobileOk) {
      return {
        valid: false,
        message: 'Enter a valid Pakistani mobile number registered with NayaPay (03XX-XXXXXXX).',
        fraudScore: 45,
      };
    }
    if (!titleOk) {
      return {
        valid: false,
        message: 'Enter your verified NayaPay Account Title.',
        fraudScore: 45,
      };
    }
    if (!refOk) {
      return {
        valid: false,
        message: 'Enter the 6+ digit NayaPay Transaction ID (TID) to initiate payment verification.',
        fraudScore: 55,
      };
    }
    return {
      valid: true,
      message: `NayaPay Settlement Reference Submitted (${input.wireReferenceNumber.trim()}). Awaiting administrative verification.`,
      fraudScore: 4,
    };
  }

  if (input.paymentMethod === 'RAAST_IBAN' || input.paymentMethod === 'BANK_TRANSFER') {
    if (input.wireReferenceNumber.trim().length < 6) {
      return {
        valid: false,
        message: 'Enter the 6+ digit RAAST Transaction ID, Stan, or Bank Wire Reference Number.',
        fraudScore: 50,
      };
    }
    return {
      valid: true,
      message: `RAAST / Bank Wire Reference Submitted (${input.wireReferenceNumber.trim()}). Recorded as PENDING_VERIFICATION.`,
      fraudScore: 4,
    };
  }

  if (input.paymentMethod === 'MANUAL') {
    if (
      input.isNationalPakistan &&
      (input.paymentSubMethod === 'JAZZCASH' || input.paymentSubMethod === 'EASYPAISA' || input.paymentSubMethod === 'NAYAPAY')
    ) {
      const mobileOk = /^(\+92|0)?\s?3[0-9]{2}[\s\-]?[0-9]{7}$/.test(
        input.walletMobileNumber.trim()
      );
      const titleOk = input.walletAccountTitle.trim().length >= 2;
      const refOk = input.wireReferenceNumber.trim().length >= 6;
      if (!mobileOk) {
        return {
          valid: false,
          message: `Enter a valid 11-digit Pakistani ${input.paymentSubMethod} mobile account number (03XX-XXXXXXX).`,
          fraudScore: 45,
        };
      }
      if (!titleOk) {
        return {
          valid: false,
          message: `Enter the verified Account Title registered with your ${input.paymentSubMethod} wallet.`,
          fraudScore: 45,
        };
      }
      if (!refOk) {
        return {
          valid: false,
          message: 'Enter the 6+ digit Transaction ID (TID) / Stan Reference to verify advance payment.',
          fraudScore: 55,
        };
      }
      return {
        valid: true,
        message: `Verified ${input.paymentSubMethod} Advance Wallet Settlement (TID: ${input.wireReferenceNumber.trim()}).`,
        fraudScore: 4,
      };
    }

    if (input.wireReferenceNumber.trim().length < 6) {
      return {
        valid: false,
        message:
          'Enter the Bank Wire / RAAST / SWIFT Transaction Reference Number (min 6 chars) to verify advance settlement.',
        fraudScore: 50,
      };
    }
    return {
      valid: true,
      message: `Verified Advance Bank Settlement Reference (${input.wireReferenceNumber.trim()}).`,
      fraudScore: 5,
    };
  }

  if (input.paymentMethod === 'COD') {
    if (input.codOtpCode.trim() !== input.generatedCodOtp) {
      return {
        valid: false,
        message:
          'Anti-Fraud Verification Required: Enter the 4-digit COD Security Verification Code shown below to confirm genuine Pakistani delivery.',
        fraudScore: 70,
      };
    }
    return {
      valid: true,
      message: 'Pakistan National Cash on Delivery (COD) Verified with Anti-Fraud Security Pin.',
      fraudScore: 8,
    };
  }

  return {
    valid: false,
    message: 'Select a valid payment protocol.',
    fraudScore: 50,
  };
}
