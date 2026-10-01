'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const PORT = Number(process.env.PORT || 10000);

const ADMIN_USER = String(
  process.env.ADMIN_USER || 'admin'
).trim();

const ADMIN_PASSWORD = String(
  process.env.ADMIN_PASSWORD || ''
).trim();

const SESSION_TTL =
  1000 * 60 * 60 * 24 * 7;

const SUPABASE_URL = String(
  process.env.SUPABASE_URL || ''
).trim();

const SUPABASE_SECRET_KEY = String(
  process.env.SUPABASE_SECRET_KEY || ''
).trim();

if (
  !SUPABASE_URL ||
  !SUPABASE_SECRET_KEY
) {
  console.error(
    'SUPABASE_URL e SUPABASE_SECRET_KEY são obrigatórios.'
  );

  process.exit(1);
}

const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_SECRET_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    }
  }
);

const DATA_FILE = path.join(
  __dirname,
  'data',
  'gameplay.json'
);

const PACKAGES = [
  {
    id: 'basico',
    name: 'Básico',
    ram: '4GB',
    gpu: 'Compartilhada',
    price: 19.90
  },
  {
    id: 'medio',
    name: 'Médio',
    ram: '8GB',
    gpu: 'Dedicada',
    price: 34.90
  },
  {
    id: 'premium',
    name: 'Premium',
    ram: '16GB',
    gpu: 'Dedicada',
    price: 59.90
  }
];

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml'
};

function sendJson(res, status, payload) {
  res.writeHead(status, {
    'Content-Type':
      'application/json; charset=utf-8',

    'Cache-Control': 'no-store'
  });

  res.end(JSON.stringify(payload));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';

    req.on('data', chunk => {
      body += chunk;

      if (body.length > 1024 * 1024) {
        req.destroy();

        reject(
          new Error('Payload muito grande')
        );
      }
    });

    req.on('end', () => {
      if (!body) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch {
        reject(
          new Error('JSON inválido')
        );
      }
    });

    req.on('error', reject);
  });
}

function normalizeUser(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

function normalizeEmail(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

function hashPassword(password) {
  const salt =
    crypto.randomBytes(16).toString('hex');

  const hash =
    crypto
      .scryptSync(
        String(password),
        salt,
        64
      )
      .toString('hex');

  return `scrypt$${salt}$${hash}`;
}

function verifyPassword(
  password,
  stored
) {
  if (!stored) {
    return false;
  }

  /*
   * Compatibilidade com contas antigas
   * que ainda estejam usando senha em
   * texto simples.
   */
  if (
    !String(stored).startsWith(
      'scrypt$'
    )
  ) {
    return (
      String(password) ===
      String(stored)
    );
  }

  const parts =
    String(stored).split('$');

  if (parts.length !== 3) {
    return false;
  }

  const [
    ,
    salt,
    expectedHex
  ] = parts;

  try {
    const actual =
      crypto.scryptSync(
        String(password),
        salt,
        64
      );

    const expected =
      Buffer.from(
        expectedHex,
        'hex'
      );

    return (
      expected.length ===
        actual.length &&
      crypto.timingSafeEqual(
        actual,
        expected
      )
    );
  } catch {
    return false;
  }
}

function extractToken(req) {
  const authorization =
    String(
      req.headers.authorization || ''
    );

  if (
    authorization.startsWith(
      'Bearer '
    )
  ) {
    return authorization
      .slice(7)
      .trim();
  }

  return String(
    req.headers[
      'x-session-token'
    ] || ''
  ).trim();
}

async function createSession(
  role,
  userId
) {
  const token =
    crypto
      .randomBytes(32)
      .toString('hex');

  const { error } =
    await supabase
      .from('sessoes')
      .insert({
        usuario_id:
          userId || null,

        token,

        ativo: true
      });

  if (error) {
    throw error;
  }

  return token;
}

async function getSession(req) {
  const token =
    extractToken(req);

  if (!token) {
    return null;
  }

  const { data: session, error } =
    await supabase
      .from('sessoes')
      .select(
        'id, usuario_id, token, ativo, created_at'
      )
      .eq('token', token)
      .eq('ativo', true)
      .maybeSingle();

  if (
    error ||
    !session
  ) {
    return null;
  }

  const createdAt =
    new Date(
      session.created_at
    ).getTime();

  if (
    !Number.isFinite(createdAt) ||
    Date.now() - createdAt >
      SESSION_TTL
  ) {
    await supabase
      .from('sessoes')
      .update({
        ativo: false
      })
      .eq(
        'id',
        session.id
      );

    return null;
  }

  /*
   * Sessão administrativa.
   */
  if (!session.usuario_id) {
    return {
      role: 'admin',
      id: null,
      token,
      sessionId:
        session.id
    };
  }

  /*
   * Busca o usuário.
   * AGORA TAMBÉM BUSCA O E-MAIL.
   */
  const {
    data: user,
    error: userError
  } = await supabase
    .from('usuarios')
    .select(
      'id, username, email, minutos, plano, created_at'
    )
    .eq(
      'id',
      session.usuario_id
    )
    .maybeSingle();

  if (
    userError ||
    !user
  ) {
    return null;
  }

  return {
    role: 'user',

    id: user.id,

    user,

    token,

    sessionId:
      session.id
  };
}

async function migrateLegacyUsers() {
  if (
    !fs.existsSync(DATA_FILE)
  ) {
    return;
  }

  try {
    const legacy =
      JSON.parse(
        fs.readFileSync(
          DATA_FILE,
          'utf8'
        )
      );

    if (
      !Array.isArray(
        legacy.users
      ) ||
      legacy.users.length === 0
    ) {
      return;
    }

    for (
      const oldUser
      of legacy.users
    ) {
      const username =
        normalizeUser(
          oldUser.username
        );

      const password =
        String(
          oldUser.password || ''
        );

      if (
        !username ||
        !password
      ) {
        continue;
      }

      const {
        data: existing
      } = await supabase
        .from('usuarios')
        .select('id')
        .eq(
          'username',
          username
        )
        .maybeSingle();

      if (existing) {
        continue;
      }

      const { error } =
        await supabase
          .from('usuarios')
          .insert({
            username,

            password:
              hashPassword(
                password
              ),

            minutos:
              Number(
                oldUser.minutos ||
                  0
              ),

            plano:
              String(
                oldUser.plano ||
                  'nenhum'
              )
          });

      if (error) {
        console.error(
          `Não foi possível migrar ${username}:`,
          error.message
        );
      } else {
        console.log(
          `Usuário migrado: ${username}`
        );
      }
    }
  } catch (error) {
    console.error(
      'Falha na migração:',
      error.message
    );
  }
}

async function handleApi(
  req,
  res,
  url
) {
  try {

    /*
     * TESTE DO SUPABASE
     */
    if (
      url.pathname ===
        '/api/health' &&
      req.method === 'GET'
    ) {
      const { error } =
        await supabase
          .from('usuarios')
          .select('id')
          .limit(1);

      if (error) {
        return sendJson(
          res,
          500,
          {
            ok: false,
            error:
              'Supabase indisponível'
          }
        );
      }

      return sendJson(
        res,
        200,
        {
          ok: true,
          database:
            'supabase'
        }
      );
    }

    /*
     * PLANOS
     */
    if (
      url.pathname ===
        '/api/packages' &&
      req.method === 'GET'
    ) {
      return sendJson(
        res,
        200,
        {
          ok: true,
          packages:
            PACKAGES
        }
      );
    }

    /*
     * CADASTRO
     *
     * Aceita:
     *
     * {
     *   username: "...",
     *   email: "...",
     *   password: "..."
     * }
     *
     * Também aceita user/pass para
     * compatibilidade com o frontend.
     */
    if (
      url.pathname ===
        '/api/register' &&
      req.method === 'POST'
    ) {
      const body =
        await readBody(req);

      /*
       * USUÁRIO
       */
      const username =
        normalizeUser(
          body.username ||
          body.user ||
          ''
        );

      /*
       * E-MAIL
       */
      const email =
        normalizeEmail(
          body.email ||
          ''
        );

      /*
       * SENHA
       */
      const password =
        String(
          body.password ||
          body.pass ||
          ''
        );

      /*
       * VALIDAÇÃO
       */
      if (
        !username ||
        !email ||
        !email.includes('@') ||
        password.length < 6
      ) {
        return sendJson(
          res,
          400,
          {
            ok: false,

            error:
              'Informe usuário, e-mail e uma senha com pelo menos 6 caracteres.'
          }
        );
      }

      /*
       * VERIFICA USUÁRIO
       */
      const {
        data: existingUser,
        error:
          lookupUserError
      } = await supabase
        .from('usuarios')
        .select('id')
        .eq(
          'username',
          username
        )
        .maybeSingle();

      if (lookupUserError) {
        throw lookupUserError;
      }

      if (existingUser) {
        return sendJson(
          res,
          409,
          {
            ok: false,
            error:
              'Usuário já cadastrado.'
          }
        );
      }

      /*
       * VERIFICA E-MAIL
       */
      const {
        data: existingEmail,
        error:
          lookupEmailError
      } = await supabase
        .from('usuarios')
        .select('id')
        .eq(
          'email',
          email
        )
        .maybeSingle();

      if (lookupEmailError) {
        throw lookupEmailError;
      }

      if (existingEmail) {
        return sendJson(
          res,
          409,
          {
            ok: false,
            error:
              'E-mail já cadastrado.'
          }
        );
      }

      /*
       * CRIA CONTA
       */
      const {
        data: created,
        error
      } = await supabase
        .from('usuarios')
        .insert({
          username,

          email,

          password:
            hashPassword(
              password
            ),

          minutos: 0,

          plano:
            'nenhum'
        })
        .select(
          'id, username, email, minutos, plano, created_at'
        )
        .single();

      if (error) {
        throw error;
      }

      return sendJson(
        res,
        201,
        {
          ok: true,

          user: created
        }
      );
    }

    /*
     * LOGIN
     *
     * Agora permite:
     *
     * usuário
     *
     * OU
     *
     * e-mail
     */
    if (
      url.pathname ===
        '/api/login' &&
      req.method === 'POST'
    ) {
      const body =
        await readBody(req);

      const user =
        normalizeUser(
          body.user ||
          body.username ||
          body.email ||
          ''
        );

      const pass =
        String(
          body.pass ||
          body.password ||
          ''
        );

      /*
       * ADMIN
       */
      if (
        user ===
          normalizeUser(
            ADMIN_USER
          ) &&
        pass ===
          ADMIN_PASSWORD
      ) {
        const token =
          await createSession(
            'admin',
            null
          );

        return sendJson(
          res,
          200,
          {
            ok: true,

            token,

            role: 'admin'
          }
        );
      }

      /*
       * PRIMEIRO:
       * procura pelo usuário
       */
      let {
        data: found,
        error
      } = await supabase
        .from('usuarios')
        .select(
          'id, username, email, password, minutos, plano, created_at'
        )
        .eq(
          'username',
          user
        )
        .maybeSingle();

      if (error) {
        throw error;
      }

      /*
       * SE NÃO ENCONTROU,
       * PROCURA PELO E-MAIL.
       */
      if (!found) {
        const result =
          await supabase
            .from('usuarios')
            .select(
              'id, username, email, password, minutos, plano, created_at'
            )
            .eq(
              'email',
              user
            )
            .maybeSingle();

        if (result.error) {
          throw result.error;
        }

        found =
          result.data;
      }

      /*
       * CONFERE SENHA
       */
      if (
        !found ||
        !verifyPassword(
          pass,
          found.password
        )
      ) {
        return sendJson(
          res,
          401,
          {
            ok: false,
            error:
              'Dados incorretos'
          }
        );
      }

      /*
       * CONVERTE CONTAS ANTIGAS
       * QUE AINDA TENHAM SENHA
       * EM TEXTO SIMPLES.
       */
      if (
        !String(
          found.password
        ).startsWith(
          'scrypt$'
        )
      ) {
        await supabase
          .from('usuarios')
          .update({
            password:
              hashPassword(
                pass
              )
          })
          .eq(
            'id',
            found.id
          );
      }

      /*
       * CRIA SESSÃO
       */
      const token =
        await createSession(
          'user',
          found.id
        );

      return sendJson(
        res,
        200,
        {
          ok: true,

          token,

          role: 'user',

          user: {
            id: found.id,

            username:
              found.username,

            email:
              found.email,

            minutos:
              found.minutos,

            plano:
              found.plano
          }
        }
      );
    }

    /*
     * USUÁRIO LOGADO
     */
    if (
      url.pathname ===
        '/api/me' &&
      req.method === 'GET'
    ) {
      const session =
        await getSession(req);

      if (!session) {
        return sendJson(
          res,
          401,
          {
            ok: false,

            error:
              'Sessão inválida ou expirada.'
          }
        );
      }

      /*
       * ADMIN
       */
      if (
        session.role ===
        'admin'
      ) {
        return sendJson(
          res,
          200,
          {
            ok: true,
            role: 'admin'
          }
        );
      }

      /*
       * USUÁRIO
       */
      return sendJson(
        res,
        200,
        {
          ok: true,

          role: 'user',

          user: {
            id:
              session.user.id,

            username:
              session.user.username,

            email:
              session.user.email,

            minutos:
              session.user.minutos,

            plano:
              session.user.plano,

            created_at:
              session.user.created_at
          }
        }
      );
    }

    /*
     * LOGOUT
     */
    if (
      url.pathname ===
        '/api/logout' &&
      req.method === 'POST'
    ) {
      const token =
        extractToken(req);

      if (token) {
        await supabase
          .from('sessoes')
          .update({
            ativo: false
          })
          .eq(
            'token',
            token
          );
      }

      return sendJson(
        res,
        200,
        {
          ok: true
        }
      );
    }

    /*
     * API NÃO ENCONTRADA
     */
    return sendJson(
      res,
      404,
      {
        ok: false,

        error:
          'API não encontrada'
      }
    );

  } catch (error) {

    console.error(
      'Erro na API:',
      error
    );

    return sendJson(
      res,
      500,
      {
        ok: false,

        error:
          'Erro interno do servidor'
      }
    );
  }
}

const server =
  http.createServer(
    async (
      req,
      res
    ) => {

      const url =
        new URL(
          req.url,

          `http://${
            req.headers.host ||
            'localhost'
          }`
        );

      /*
       * API
       */
      if (
        url.pathname.startsWith(
          '/api/'
        )
      ) {
        return handleApi(
          req,
          res,
          url
        );
      }

      /*
       * ARQUIVOS DO SITE
       */
      let requestPath =
        decodeURIComponent(
          url.pathname
        );

      if (
        requestPath === '/'
      ) {
        requestPath =
          '/index.html';
      }

      const filePath =
        path.resolve(
          __dirname,
          `.${requestPath}`
        );

      const rootPath =
        path.resolve(
          __dirname
        );

      /*
       * PROTEÇÃO CONTRA
       * PATH TRAVERSAL
       */
      if (
        !filePath.startsWith(
          rootPath +
            path.sep
        ) &&
        filePath !== rootPath
      ) {
        res.writeHead(403);

        return res.end(
          'Acesso negado'
        );
      }

      const ext =
        path.extname(
          filePath
        );

      const mimeType =
        mimeTypes[ext] ||
        'application/octet-stream';

      if (
        !fs.existsSync(
          filePath
        )
      ) {
        res.writeHead(404);

        return res.end(
          'Página não encontrada'
        );
      }

      fs.readFile(
        filePath,
        (
          err,
          content
        ) => {

          if (err) {
            res.writeHead(
              500
            );

            return res.end(
              'Erro no servidor'
            );
          }

          res.writeHead(
            200,
            {
              'Content-Type':
                mimeType
            }
          );

          res.end(
            content
          );
        }
      );
    }
  );

async function start() {

  await migrateLegacyUsers();

  server.listen(
    PORT,
    () => {

      console.log(
        `🚀 Império GamePlay rodando na porta ${PORT}`
      );

      console.log(
        '☁️ Persistência: Supabase'
      );

      console.log(
        '📧 Cadastro com e-mail ativado'
      );

      console.log(
        '🔐 Login por usuário ou e-mail ativado'
      );
    }
  );
}

start().catch(
  error => {

    console.error(
      'Falha ao iniciar:',
      error
    );

    process.exit(1);
  }
);
