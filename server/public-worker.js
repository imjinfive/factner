import worker from './worker.js';
import { BidRoom as Room } from './bid-room.js';
import schema from '../migrations/0013_bid_market.sql';
import reviewSchema from '../migrations/0015_market_post_review.sql';
import offerSchema from '../migrations/0018_market_offer_review.sql';
import agreementSchema from '../migrations/0019_submission_agreements.sql';

export class BidRoom extends Room {
  constructor(ctx) { super(ctx, schema, reviewSchema, offerSchema, agreementSchema); }
}

export default worker;
