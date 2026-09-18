export interface RankableEquipment {
  id: string;
  title: string;
  pricePerShift: number;
  responseMinutes: number;
  supplierRating: number;
}

export interface RankedEquipment extends RankableEquipment {
  score: number;
  explanation: string;
}

export function rankEquipment(items: RankableEquipment[]): RankedEquipment[] {
  return items
    .map((item) => {
      const score = item.supplierRating * 20 + Math.max(0, 120 - item.responseMinutes) / 4 - item.pricePerShift / 10_000;
      const reason = item.responseMinutes <= 45
        ? 'подходит по типу техники и быстро подаётся'
        : item.supplierRating >= 4.8
          ? 'подходит по задаче и рейтингу поставщика'
          : 'подходит по типу техники и доступности';
      return { ...item, score: Number(score.toFixed(3)), explanation: reason };
    })
    .sort((a, b) => b.score - a.score || a.pricePerShift - b.pricePerShift || a.id.localeCompare(b.id));
}

