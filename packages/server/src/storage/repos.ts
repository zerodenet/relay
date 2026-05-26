import {
  forwardsFileSchema,
  nodesFileSchema,
  subscriptionsFileSchema,
  tunnelsFileSchema,
  type Forward,
  type Node,
  type Subscription,
  type Tunnel,
} from '@zero-panel/shared'
import { paths } from './paths.js'
import { EntityRepository } from './entity-repo.js'

export const subscriptionRepo = new EntityRepository<typeof subscriptionsFileSchema, Subscription>(
  paths.subscriptions,
  subscriptionsFileSchema,
)

export const nodeRepo = new EntityRepository<typeof nodesFileSchema, Node>(
  paths.nodes,
  nodesFileSchema,
)

export const tunnelRepo = new EntityRepository<typeof tunnelsFileSchema, Tunnel>(
  paths.tunnels,
  tunnelsFileSchema,
)

export const forwardRepo = new EntityRepository<typeof forwardsFileSchema, Forward>(
  paths.forwards,
  forwardsFileSchema,
)
