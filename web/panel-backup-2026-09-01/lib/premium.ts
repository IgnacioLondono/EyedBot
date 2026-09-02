/** Bloqueo visual/API de funciones EyedPlus+ (solo si el servidor exige premium). */
export function isPremiumFeatureLocked(premiumRequired: boolean, hasPremium: boolean) {
  return premiumRequired && !hasPremium;
}

export function canUsePremiumFeatures(premiumRequired: boolean, hasPremium: boolean) {
  return !premiumRequired || hasPremium;
}
