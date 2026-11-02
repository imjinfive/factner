import worker from './worker.js';
import { BidRoom as Room } from './bid-room.js';
import schema from '../migrations/0013_bid_market.sql';

export class BidRoom extends Room {
  constructor(ctx) { super(ctx, schema); }
}

export default worker;
