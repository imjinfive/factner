import worker from './worker.js';
import { BidRoom as Room } from './bid-room.js';
import schema from '../migrations/0013_bid_market.sql';
import reviewSchema from '../migrations/0015_market_post_review.sql';

export class BidRoom extends Room {
  constructor(ctx) { super(ctx, schema, reviewSchema); }
}

export default worker;
