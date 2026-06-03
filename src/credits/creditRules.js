export const DISCIPLINE_CAPACITY = {
    'Train': 8,
    'Indoor Cycling': 11,
    'Pilates': 4
};

export const DISCIPLINE_ICONS = {
    'Pilates': 'fa-child-reaching',
    'Train': 'fa-dumbbell',
    'Indoor Cycling': 'fa-bicycle'
};

export const CREDIT_LABELS = { 
    indoor: 'Indoor Cycling', 
    train: 'Train', 
    pilates: 'Pilates', 
    open: 'VIP (Comodín)' 
};

/**
 * Calculates the total credits from a profile record.
 */
export function getCreditsTotal(profile) {
    const indoor  = profile?.credits_indoor  ?? 0;
    const train   = profile?.credits_train   ?? 0;
    const pilates = profile?.credits_pilates ?? 0;
    const open    = profile?.credits_open    ?? 0;
    return profile?.credits ?? (indoor + train + pilates + open);
}
