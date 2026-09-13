const express = require('express');
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const db = {
    users: [],
    applications: [],
    licenses: [],
    logs: []
};

function recordLog(action, details) {
    db.logs.unshift({ time: new Date().toISOString().replace('T', ' ').substring(0, 19), action, details });
    if (db.logs.length > 50) db.logs.pop();
}

// ==========================================
// API DE AUTENTICAÇÃO (Para o Visual Studio / C#)
// ==========================================
app.get('/api/status', (req, res) => {
    res.json({ Success: true, Message: "API MH Auth online.", Code: "SUCCESS" });
});

app.post('/api/login', (req, res) => {
    const { name, ownerid, secret, license, hwid } = req.body;
    const appConfig = db.applications.find(a => a.name === name && a.ownerid === ownerid && a.secret === secret);
    
    if (!appConfig) {
        return res.json({ Success: false, Message: "Credenciais da aplicação inválidas.", Code: "INVALID_APP", Data: null });
    }

    const lic = db.licenses.find(l => l.appId === appConfig.ownerid && l.key === license);
    if (!lic) {
        return res.json({ Success: false, Message: "Chave inválida.", Code: "INVALID_KEY", Data: null });
    }

    // Verificar expiração se não for lifetime
    if (!lic.permanent && lic.expiresAt && new Date() > new Date(lic.expiresAt)) {
        return res.json({ Success: false, Message: "Chave expirada.", Code: "EXPIRED_KEY", Data: null });
    }

    if (!lic.hwid) {
        lic.hwid = hwid;
        recordLog("HWID VINCULADO", `Key ${license} vinculada ao PC.`);
    }

    if (lic.hwid !== hwid) {
        return res.json({ Success: false, Message: "HWID incorreto para esta chave.", Code: "HWID_MISMATCH", Data: null });
    }

    recordLog("LOGIN SUCESSO", `Key autenticada: ${license}`);
    res.json({
        Success: true,
        Message: "Acesso liberado!",
        Code: "LOGIN_SUCCESS",
        Data: {
            License: lic.key,
            Status: "Ativa",
            Hwid: lic.hwid,
            Permanent: lic.permanent,
            ExpiresAt: lic.permanent ? "Lifetime" : lic.expiresAt
        }
    });
});

// ==========================================
// PAINEL WEB COM ANIMAÇÕES E OPÇÃO DE LIFETIME
// ==========================================
app.get('/', (req, res) => {
    const userEmail = req.query.email;
    const currentUser = db.users.find(u => u.email === userEmail);

    if (!currentUser) {
        return res.send(`
            <!DOCTYPE html>
            <html lang="pt-BR">
            <head>
                <meta charset="UTF-8">
                <title>MH Auth - Entrar</title>
                <style>
                    body { font-family: 'Segoe UI', sans-serif; background: #080b11; color: #f8fafc; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
                    .auth-card { background: #121824; padding: 40px; border-radius: 12px; width: 380px; border: 1px solid #1e293b; box-shadow: 0 10px 25px rgba(0,0,0,0.7); animation: fadeIn 0.5s ease-in-out; }
                    @keyframes fadeIn { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
                    h2 { color: #38bdf8; text-align: center; margin-bottom: 25px; letter-spacing: 1px; }
                    input { width: 100%; padding: 12px; margin-bottom: 15px; border-radius: 6px; border: 1px solid #334155; background: #0b0f17; color: white; box-sizing: border-box; }
                    button { width: 100%; padding: 12px; border-radius: 6px; border: none; background: #0284c7; color: white; font-weight: bold; cursor: pointer; transition: 0.2s; }
                    button:hover { background: #0369a1; transform: scale(1.02); }
                </style>
            </head>
            <body>
                <div class="auth-card">
                    <h2>M H &nbsp; A U T H</h2>
                    <form action="/login-account" method="POST">
                        <input type="email" name="email" placeholder="Seu e-mail" required>
                        <input type="password" name="password" placeholder="Sua senha" required>
                        <button type="submit">Entrar no Painel</button>
                    </form>
                </div>
            </body>
            </html>
        `);
    }

    let userApp = db.applications.find(a => a.ownerEmail === currentUser.email);
    if (!userApp) {
        userApp = {
            name: "MeuApp",
            ownerid: "owner_" + Math.random().toString(36).substring(2, 10),
            secret: "sec_" + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15),
            version: "v1.0",
            ownerEmail: currentUser.email,
            createdAt: new Date().toISOString().replace('T', ' ').substring(0, 19)
        };
        db.applications.push(userApp);
        recordLog("APPLICATION CREATED", userApp.name);
    }

    const userKeys = db.licenses.filter(l => l.appId === userApp.ownerid);
    const tab = req.query.tab || 'dashboard';

    res.send(`
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
            <meta charset="UTF-8">
            <title>MH Auth - Painel</title>
            <style>
                body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #080b11; color: #f8fafc; margin: 0; display: flex; height: 100vh; overflow: hidden; }
                .sidebar { width: 240px; background: #0b0f17; border-right: 1px solid #161e2e; display: flex; flex-direction: column; padding: 20px 0; }
                .logo { font-size: 18px; font-weight: bold; color: #fff; padding: 0 25px 25px 25px; border-bottom: 1px solid #161e2e; letter-spacing: 1px; }
                .logo span { color: #0284c7; }
                .nav-links { padding: 20px 15px; display: flex; flex-direction: column; gap: 5px; flex: 1; }
                .nav-links a { padding: 10px 15px; color: #94a3b8; text-decoration: none; border-radius: 6px; font-size: 14px; font-weight: 500; display: flex; align-items: center; gap: 10px; transition: all 0.2s ease; }
                .nav-links a:hover, .nav-links a.active { background: #121824; color: #38bdf8; transform: translateX(4px); }
                .logout { padding: 15px 25px; border-top: 1px solid #161e2e; }
                .logout a { color: #ef4444; text-decoration: none; font-size: 14px; font-weight: 500; }

                .main { flex: 1; padding: 30px 40px; overflow-y: auto; animation: fadeInMain 0.4s ease-out; }
                @keyframes fadeInMain { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }

                .top-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px; }
                .subtitle { color: #64748b; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; font-weight: bold; }
                .title { font-size: 26px; font-weight: bold; margin: 5px 0 0 0; color: #fff; }
                .desc { color: #94a3b8; font-size: 14px; margin-top: 4px; }
                
                .user-badge { background: #121824; border: 1px solid #1e293b; padding: 6px 15px; border-radius: 8px; display: flex; align-items: center; gap: 10px; }
                .user-avatar { background: #0284c7; color: white; width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 12px; }
                .user-info span { display: block; font-size: 12px; color: #94a3b8; }
                .user-info b { font-size: 13px; color: #fff; }

                .btn-primary { background: #0284c7; color: white; border: none; padding: 10px 18px; border-radius: 6px; font-weight: bold; font-size: 13px; cursor: pointer; transition: 0.2s; text-decoration: none; display: inline-block; }
                .btn-primary:hover { background: #0369a1; transform: translateY(-1px); }

                .stats-grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 15px; margin-bottom: 30px; }
                .stat-card { background: #121824; border: 1px solid #1e293b; padding: 18px; border-radius: 10px; transition: 0.2s; }
                .stat-card:hover { border-color: #0284c7; transform: translateY(-2px); }
                .stat-num { font-size: 22px; font-weight: bold; color: #fff; margin-top: 10px; }
                .stat-label { font-size: 11px; color: #64748b; text-transform: uppercase; font-weight: bold; }
                .stat-sub { font-size: 11px; color: #475569; margin-top: 4px; }

                .section-box { background: #121824; border: 1px solid #1e293b; border-radius: 10px; padding: 25px; margin-bottom: 25px; }
                .section-title { font-size: 16px; font-weight: bold; color: #fff; margin-bottom: 15px; }
                
                table { width: 100%; border-collapse: collapse; }
                th, td { padding: 12px 15px; text-align: left; border-bottom: 1px solid #1a2234; font-size: 13px; }
                th { color: #64748b; font-size: 11px; text-transform: uppercase; }
                td { color: #cbd5e1; }
                
                .badge-ativa { background: rgba(2, 132, 199, 0.15); color: #38bdf8; padding: 4px 10px; border-radius: 4px; font-size: 11px; font-weight: bold; border: 1px solid rgba(2, 132, 199, 0.3); }
                
                input[type="text"], input[type="number"], select { background: #080b11; border: 1px solid #1e293b; padding: 10px 14px; border-radius: 6px; color: #fff; font-size: 13px; width: 100%; box-sizing: border-box; margin-bottom: 15px; }
                label { display: block; font-size: 12px; color: #94a3b8; margin-bottom: 5px; font-weight: 600; }
                .code-box { background: #080b11; padding: 15px; border-radius: 6px; font-family: monospace; font-size: 12px; color: #38bdf8; overflow-x: auto; border: 1px solid #1e293b; line-height: 1.5; }
                .log-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #1a2234; font-size: 13px; font-family: monospace; }
            </style>
            <script>
                function toggleDurationType() {
                    const type = document.getElementById('durationType').value;
                    const daysField = document.getElementById('daysFieldContainer');
                    if (type === 'lifetime') {
                        daysField.style.display = 'none';
                    } else {
                        daysField.style.display = 'block';
                    }
                }
            </script>
        </head>
        <body>
            <div class="sidebar">
                <div class="logo">MH <span>AUTH</span></div>
                <div class="nav-links">
                    <a href="/?email=${currentUser.email}&tab=dashboard" class="${tab === 'dashboard' ? 'active' : ''}">📊 Dashboard</a>
                    <a href="/?email=${currentUser.email}&tab=keys" class="${tab === 'keys' ? 'active' : ''}">🔑 Licenças</a>
                    <a href="/?email=${currentUser.email}&tab=settings" class="${tab === 'settings' ? 'active' : ''}">⚙️ Configurações / Conta</a>
                    <a href="/?email=${currentUser.email}&tab=sdk" class="${tab === 'sdk' ? 'active' : ''}">📦 SDK & Visual Studio</a>
                    <a href="/?email=${currentUser.email}&tab=logs" class="${tab === 'logs' ? 'active' : ''}">📝 Logs</a>
                </div>
                <div class="logout">
                    <a href="/">🚪 Sair da conta</a>
                </div>
            </div>

            <div class="main">
                <div class="top-header">
                    <div>
                        <div class="subtitle">Painel de Administração</div>
                        <div class="title">${tab.charAt(0).toUpperCase() + tab.slice(1)}</div>
                        <div class="desc">Gerencie sua aplicação e licenças com facilidade.</div>
                    </div>
                    <div class="user-badge">
                        <div class="user-avatar">${currentUser.email.substring(0, 1).toUpperCase()}</div>
                        <div class="user-info">
                            <b>${currentUser.email.split('@')[0]}</b>
                            <span>Administrador</span>
                        </div>
                    </div>
                </div>

                ${tab === 'dashboard' ? `
                    <div class="stats-grid">
                        <div class="stat-card">
                            <div class="stat-label">Aplicação</div>
                            <div class="stat-num" style="font-size: 16px; margin-top: 12px; color: #38bdf8;">${userApp.name}</div>
                            <div class="stat-sub">Versão: ${userApp.version}</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-label">Total Keys</div>
                            <div class="stat-num">${userKeys.length}</div>
                            <div class="stat-sub">Criadas</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-label">Ativas</div>
                            <div class="stat-num">${userKeys.length}</div>
                            <div class="stat-sub">Prontas</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-label">Revogadas</div>
                            <div class="stat-num">0</div>
                            <div class="stat-sub">Bloqueadas</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-label">Expiradas</div>
                            <div class="stat-num">0</div>
                            <div class="stat-sub">Renovar</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-label">Permanentes</div>
                            <div class="stat-num">${userKeys.filter(k => k.permanent).length}</div>
                            <div class="stat-sub">Lifetime</div>
                        </div>
                    </div>

                    <div class="section-box">
                        <div class="section-title">Atividade Recente</div>
                        <div>
                            ${db.logs.length === 0 ? '<div style="color:#64748b; font-size:13px;">Nenhum log registrado.</div>' : db.logs.slice(0, 5).map(l => `
                                <div class="log-row">
                                    <span style="color: #38bdf8;"><b>${l.action}</b>: ${l.details}</span>
                                    <span style="color: #64748b;">${l.time}</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                ` : ''}

                ${tab === 'keys' ? `
                    <div class="section-box">
                        <div class="section-title">Criar Nova Licença / Key</div>
                        <form action="/create-key?email=${currentUser.email}" method="POST" style="margin-bottom: 25px;">
                            <label>Chave de Acesso (Key)</label>
                            <input type="text" name="newKey" placeholder="Ex: MH-VIP-XXXX-YYYY" required>
                            
                            <label>Tipo de Validade</label>
                            <select id="durationType" name="durationType" onchange="toggleDurationType()">
                                <option value="days">Dias (Personalizado)</option>
                                <option value="lifetime">Lifetime (Sem expiração)</option>
                            </select>

                            <div id="daysFieldContainer" style="margin-top: 15px;">
                                <label>Quantidade de Dias</label>
                                <input type="number" name="daysCount" value="30" min="1">
                            </div>

                            <button type="submit" class="btn-primary" style="margin-top: 15px;">Gerar Key</button>
                        </form>

                        <div class="section-title" style="margin-top: 30px;">Keys Cadastradas</div>
                        <table>
                            <tr><th>Chave</th><th>Status</th><th>Validade</th><th>HWID Vinculado</th></tr>
                            ${userKeys.length === 0 ? '<tr><td colspan="4" style="color:#64748b;">Nenhuma licença cadastrada.</td></tr>' : userKeys.map(k => `
                                <tr>
                                    <td><b>${k.key}</b></td>
                                    <td><span class="badge-ativa">${k.status}</span></td>
                                    <td>${k.permanent ? 'Lifetime (Permanente)' : k.daysLeft + ' dias'}</td>
                                    <td><span style="color: ${k.hwid ? '#38bdf8' : '#64748b'}">${k.hwid || 'Livre'}</span></td>
                                </tr>
                            `).join('')}
                        </table>
                    </div>
                ` : ''}

                ${tab === 'settings' ? `
                    <div class="section-box" style="max-width: 600px;">
                        <div class="section-title">Configurações da Aplicação e Conta</div>
                        <p style="color: #94a3b8; font-size: 13px; margin-bottom: 20px;">Personalize o nome da aplicação, versão e Owner ID.</p>
                        
                        <form action="/update-settings?email=${currentUser.email}" method="POST">
                            <label>Nome da Aplicação</label>
                            <input type="text" name="appName" value="${userApp.name}" required>

                            <label>Versão</label>
                            <input type="text" name="appVersion" value="${userApp.version}" required>

                            <label>Owner ID</label>
                            <input type="text" name="appOwnerId" value="${userApp.ownerid}" required>

                            <label>Secret da Aplicação (Gerado Automaticamente)</label>
                            <input type="text" value="${userApp.secret}" disabled style="color: #64748b; cursor: not-allowed;">

                            <button type="submit" class="btn-primary" style="margin-top: 10px;">Salvar Alterações</button>
                        </form>
                    </div>
                ` : ''}

                ${tab === 'sdk' ? `
                    <div class="section-box">
                        <div class="section-title">Código de Integração para o Visual Studio (C#)</div>
                        <p style="color: #94a3b8; font-size: 13px; margin-bottom: 15px;">Cole este código no seu projeto C#:</p>
                        
                        <div class="code-box">
using System;
using System.Net.Http;
using System.Text;
using System.Threading.Tasks;
using Newtonsoft.Json;

namespace MHAuthClient
{
    public class Auth
    {
        private static string name = "${userApp.name}";
        private static string ownerid = "${userApp.ownerid}";
        private static string secret = "${userApp.secret}";
        private static string version = "${userApp.version}";

        public static async Task&lt;bool&gt; Login(string licenseKey, string hwid)
        {
            using (HttpClient client = new HttpClient())
            {
                var payload = new { name, ownerid, secret, version, license = licenseKey, hwid };
                var content = new StringContent(JsonConvert.SerializeObject(payload), Encoding.UTF8, "application/json");

                HttpResponseMessage response = await client.PostAsync("http://localhost:3000/api/login", content);
                dynamic result = JsonConvert.DeserializeObject(await response.Content.ReadAsStringAsync());
                return result.Success == true;
            }
        }
    }
}
                        </div>
                    </div>
                ` : ''}

                ${tab === 'logs' ? `
                    <div class="section-box">
                        <div class="section-title">Logs de Atividade do Sistema</div>
                        <div>
                            ${db.logs.length === 0 ? '<div style="color:#64748b;">Nenhum log encontrado.</div>' : db.logs.map(l => `
                                <div class="log-row">
                                    <span><b>[${l.action}]</b> ${l.details}</span>
                                    <span style="color: #64748b;">${l.time}</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                ` : ''}
            </div>
        </body>
        </html>
    `);
});

app.post('/login-account', (req, res) => {
    const { email } = req.body;
    if (!email) return res.redirect('/');
    let user = db.users.find(u => u.email === email);
    if (!user) {
        db.users.push({ email });
        recordLog("USER REGISTERED", email);
    } else {
        recordLog("USER LOGIN", email);
    }
    res.redirect(`/?email=${email}&tab=settings`);
});

app.post('/update-settings', (req, res) => {
    const email = req.query.email;
    const { appName, appVersion, appOwnerId } = req.body;
    let userApp = db.applications.find(a => a.ownerEmail === email);
    
    if (userApp) {
        userApp.name = appName.trim();
        userApp.version = appVersion.trim();
        userApp.ownerid = appOwnerId.trim();
        recordLog("SETTINGS UPDATED", `App: ${userApp.name}`);
    }
    res.redirect(`/?email=${email}&tab=settings`);
});

app.post('/create-key', (req, res) => {
    const email = req.query.email;
    const { newKey, durationType, daysCount } = req.body;
    const userApp = db.applications.find(a => a.ownerEmail === email);

    if (userApp && newKey) {
        const isPermanent = durationType === 'lifetime';
        let expiresAt = null;

        if (!isPermanent) {
            const days = parseInt(daysCount) || 30;
            const date = new Date();
            date.setDate(date.getDate() + days);
            expiresAt = date.toISOString();
        }

        db.licenses.push({
            appId: userApp.ownerid,
            key: newKey.trim(),
            status: "Ativa",
            permanent: isPermanent,
            daysLeft: isPermanent ? 0 : (parseInt(daysCount) || 30),
            expiresAt: expiresAt,
            hwid: ""
        });
        recordLog("KEY CREATED", `Key: ${newKey.trim()} (${isPermanent ? 'Lifetime' : daysCount + ' dias'})`);
    }
    res.redirect(`/?email=${email}&tab=keys`);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor MH Auth rodando na porta ${PORT}`);
});