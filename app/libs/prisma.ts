/**
 * Prisma Client Configuration
 *
 * Uses lazy initialization to prevent connection pool issues on startup.
 */

import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '@prisma/client';

let prismaClient: PrismaClient | null = null;

function getAdapter() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');

  const u = new URL(url);
  const database = u.pathname.replace(/^\//, '');
  const connectionLimit = Number(u.searchParams.get('connection_limit')) || 5;

  return new PrismaMariaDb({
    host: u.hostname,
    port: u.port ? Number(u.port) : 3306,
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database,
    connectionLimit,
  });
}

export function getPrisma(): PrismaClient {
  if (!prismaClient) {
    prismaClient = new PrismaClient({
      adapter: getAdapter(),
      log: ['error'],
    });
  }
  return prismaClient;
}

const prisma = {
  get $connect() {
    return getPrisma().$connect.bind(getPrisma());
  },
  get $disconnect() {
    return getPrisma().$disconnect.bind(getPrisma());
  },
  get $queryRaw() {
    return getPrisma().$queryRaw.bind(getPrisma());
  },
  get $transaction() {
    return getPrisma().$transaction.bind(getPrisma());
  },
  get users() {
    return getPrisma().users;
  },
  get roles() {
    return getPrisma().roles;
  },
  get ticket() {
    return getPrisma().ticket;
  },
  get ticket_tracking() {
    return getPrisma().ticket_tracking;
  },
  get service_area() {
    return getPrisma().service_area;
  },
  get user_sa() {
    return getPrisma().user_sa;
  },
  get area() {
    return getPrisma().area;
  },
  get technician_attendance() {
    return getPrisma().technician_attendance;
  },
  get ticket_assign_history() {
    return getPrisma().ticket_assign_history;
  },
  get ticket_evidence() {
    return getPrisma().ticket_evidence;
  },
  get ticket_status_history() {
    return getPrisma().ticket_status_history;
  },
  get ticket_assignment_history() {
    return getPrisma().ticket_assignment_history;
  },
  get ticket_activity_log() {
    return getPrisma().ticket_activity_log;
  },
};

export default prisma;
