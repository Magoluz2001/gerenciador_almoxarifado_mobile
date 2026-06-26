import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, Button, TouchableOpacity, Alert, ScrollView, TextInput, Modal, FlatList, Switch } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { createClient } from '@supabase/supabase-js';

// 1. Ligação à Base de Dados (Com proteção contra crash)
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://erro-na-url.supabase.co';
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_KEY || 'erro-na-chave';

const supabase = createClient(supabaseUrl, supabaseKey);

export default function App() {
  const [ecraAtual, setEcraAtual] = useState('login'); // login, cadastroUsuario, dashboard, scanner, detalhes, cadastroSku, entradaEstoque, gestaoUsuarios
  const [permissao, pedirPermissao] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [codigoLido, setCodigoLido] = useState('');
  
  // Autenticação Segura
  const [userId, setUserId] = useState(null); // Guarda o ID para atualizar permissões
  const [emailLogin, setEmailLogin] = useState('');
  const [senhaLogin, setSenhaLogin] = useState('');
  
  // Cadastro de Novo Usuário no App
  const [nomeNovo, setNomeNovo] = useState('');
  const [matriculaNova, setMatriculaNova] = useState('');
  const [emailNovo, setEmailNovo] = useState('');
  const [senhaNova, setSenhaNova] = useState('');

  // Dados do Utilizador logado
  const [usuarioNome, setUsuarioNome] = useState('');
  const [usuarioMatricula, setUsuarioMatricula] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [acessos, setAcessos] = useState({ dashboard: false, cadastros: false, movimentacoes: false, ajustes: false });

  // Estados Gerais e Dashboard
  const [zoomCamera, setZoomCamera] = useState(0); 
  const [modalManualVisivel, setModalManualVisivel] = useState(false);
  const [codigoManual, setCodigoManual] = useState('');
  const [isFardoScanned, setIsFardoScanned] = useState(false);
  const [estoqueAgrupado, setEstoqueAgrupado] = useState([]);
  const [produtosBaseDb, setProdutosBaseDb] = useState([]); 
  const [dadosProduto, setDadosProduto] = useState(null);
  const [lotesProduto, setLotesProduto] = useState([]);
  const [loteSelecionado, setLoteSelecionado] = useState(null);
  const [qtdAcao, setQtdAcao] = useState(1);
  
  // Gestão de Usuários (Apenas Admin)
  const [usuariosAdmins, setUsuariosAdmins] = useState([]);

  // Formulários
  const [formLote, setFormLote] = useState('');
  const [formValidade, setFormValidade] = useState('');
  const [formQtdEntrada, setFormQtdEntrada] = useState('');
  const [formDescricao, setFormDescricao] = useState('');
  const [formConteudo, setFormConteudo] = useState('1');
  const [formBase, setFormBase] = useState(null);
  const [formUnidade, setFormUnidade] = useState(null);
  const [formCodigoUnidade, setFormCodigoUnidade] = useState('');
  const [formCodigoFardo, setFormCodigoFardo] = useState('');
  const [formQtdPorFardo, setFormQtdPorFardo] = useState('1');
  const [modalBaseVisivel, setModalBaseVisivel] = useState(false);
  const [modalUnidVisivel, setModalUnidVisivel] = useState(false);
  const unidadesOpcoes = ["KG", "G", "L", "ML"];

  const formatarUnidade = (valor, unidade) => {
    let num = parseFloat(valor);
    let u = (unidade || '').toUpperCase();
    if (u === 'G' && num >= 1000) return `${(num / 1000).toFixed(2)} KG`;
    else if (u === 'KG' && num > 0 && num < 1) return `${(num * 1000).toFixed(0)} G`;
    else if (u === 'ML' && num >= 1000) return `${(num / 1000).toFixed(2)} L`;
    else if (u === 'L' && num > 0 && num < 1) return `${(num * 1000).toFixed(0)} ML`;
    return `${num.toFixed(2)} ${u}`;
  };

  const buscarDadosIniciais = async () => {
    const { data: lotesData } = await supabase.from('lotes_validade').select('*, produtos_skus(*)').gt('quantidade_atual', 0);
    const { data: baseData } = await supabase.from('produtos_base').select('*').order('nome_oficial');
    // Puxando o histórico de Saídas para fazer o cálculo da Previsão de Duração
    const { data: movsData } = await supabase.from('movimentacoes')
      .select('quantidade_movimentada, data_movimentacao, lotes_validade(id_sku_relacionado, produtos_skus(id_base_relacionado, conteudo_liquido))')
      .eq('tipo_movimentacao', 'SAÍDA');

    if (baseData) setProdutosBaseDb(baseData);
    if (lotesData && baseData) {
      const agrupado = {};
      baseData.forEach(base => { 
        agrupado[base.id] = { nome: base.nome_oficial, lotes: [], totalReal: 0, unidadeExibicao: base.unidade_medida, totalSaidas: 0, primeiraSaida: null }; 
      });
      
      lotesData.forEach(lote => {
        const sku = lote.produtos_skus;
        const baseId = sku.id_base_relacionado;
        if (agrupado[baseId]) {
          const qtdReal = lote.quantidade_atual * sku.conteudo_liquido;
          agrupado[baseId].totalReal += qtdReal;
          agrupado[baseId].unidadeExibicao = sku.unidade_medida_real || agrupado[baseId].unidadeExibicao;
          agrupado[baseId].lotes.push({ ...lote, qtdRealCalculada: qtdReal, pacotesFisicos: lote.quantidade_atual });
        }
      });

      if (movsData) {
        movsData.forEach(mov => {
          const sku = mov.lotes_validade?.produtos_skus;
          if (sku) {
            const bId = sku.id_base_relacionado;
            if (agrupado[bId]) {
              const qtdReal = mov.quantidade_movimentada * sku.conteudo_liquido;
              agrupado[bId].totalSaidas += qtdReal;
              const dMov = new Date(mov.data_movimentacao);
              if (!agrupado[bId].primeiraSaida || dMov < agrupado[bId].primeiraSaida) {
                agrupado[bId].primeiraSaida = dMov;
              }
            }
          }
        });
      }

      const hoje = new Date();
      const comEstoque = Object.values(agrupado).filter(grupo => grupo.totalReal > 0).map(grupo => {
        let textoPrevisao = "🔄 Sem histórico de saída para prever a duração.";
        if (grupo.primeiraSaida && grupo.totalSaidas > 0) {
          const diffTime = Math.abs(hoje - grupo.primeiraSaida);
          const diasDecorridos = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
          const consumoDiario = grupo.totalSaidas / diasDecorridos;
          if (consumoDiario > 0) {
            const diasRestantes = Math.floor(grupo.totalReal / consumoDiario);
            textoPrevisao = `⏳ Média: ${formatarUnidade(consumoDiario, grupo.unidadeExibicao)}/dia ➔ Est. duração: ${diasRestantes} dias.`;
          }
        }
        return { ...grupo, textoPrevisao };
      });

      comEstoque.sort((a, b) => a.nome.localeCompare(b.nome));
      setEstoqueAgrupado(comEstoque);
    }
  };

  const carregarUsuarios = async () => {
    const { data } = await supabase.from('perfis').select('*').order('criado_em');
    if (data) setUsuariosAdmins(data);
  };

  useEffect(() => { 
    if (ecraAtual === 'dashboard' && acessos.dashboard) buscarDadosIniciais(); 
    if (ecraAtual === 'gestaoUsuarios' && isAdmin) carregarUsuarios();
  }, [ecraAtual, acessos, isAdmin]);

  // FUNÇÃO DE CARREGAR PERFIL SEPARADA
  const carregarPerfilUsuario = async (uid) => {
    const { data: perfilData, error: perfilError } = await supabase.from('perfis').select('*').eq('id', uid).single();
    
    if (perfilError || !perfilData) {
      await supabase.auth.signOut();
      Alert.alert('Acesso Negado', 'Perfil não encontrado no banco de dados.');
      setEcraAtual('login');
    } else if (perfilData.funcao === 'PENDENTE') {
      await supabase.auth.signOut();
      Alert.alert('Conta em Análise', 'Sua conta foi criada, mas está aguardando a liberação do Administrador.');
      setEcraAtual('login');
    } else {
      setUsuarioMatricula(perfilData.matricula);
      setUsuarioNome(perfilData.nome_completo);
      setIsAdmin(perfilData.funcao === 'ADMIN');
      setAcessos({
        dashboard: perfilData.acesso_dashboard || false,
        cadastros: perfilData.acesso_cadastros || false,
        movimentacoes: perfilData.acesso_movimentacoes || false,
        ajustes: perfilData.acesso_ajustes || false
      });
      setEcraAtual('dashboard');
    }
  };

  // FUNÇÃO: LOGIN
  const fazerLogin = async () => {
    if (!emailLogin || !senhaLogin) return Alert.alert('Atenção', 'Preencha o e-mail e a senha.');
    
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: emailLogin.trim().toLowerCase(),
      password: senhaLogin
    });

    if (authError) {
      Alert.alert('Erro', 'E-mail ou senha incorretos.');
    } else if (authData.user) {
      setUserId(authData.user.id);
      await carregarPerfilUsuario(authData.user.id);
    }
  };

  // FUNÇÃO PARA ATUALIZAR PERMISSÕES MANUALMENTE
  const atualizarPermissoes = async () => {
    if (userId) {
      await carregarPerfilUsuario(userId);
      Alert.alert('Sucesso', 'Permissões sincronizadas com o servidor!');
    }
  };

  // FUNÇÃO: CRIAR CONTA NO APP
  const criarConta = async () => {
    if (!nomeNovo || !matriculaNova || !emailNovo || senhaNova.length < 6) {
      return Alert.alert('Atenção', 'Preencha todos os campos. A senha deve ter no mínimo 6 caracteres.');
    }
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: emailNovo.trim().toLowerCase(),
      password: senhaNova
    });
    if (authError) {
      Alert.alert('Erro', 'Não foi possível criar a conta. Este e-mail já pode estar em uso.');
    } else if (authData.user) {
      const { error: perfilError } = await supabase.from('perfis').insert({
        id: authData.user.id,
        email: emailNovo.trim().toLowerCase(),
        matricula: matriculaNova.trim(),
        nome_completo: nomeNovo.trim(),
        funcao: 'PENDENTE',
        acesso_dashboard: false,
        acesso_cadastros: false,
        acesso_movimentacoes: false,
        acesso_ajustes: false
      });
      if (perfilError) {
        Alert.alert('Erro', 'Conta criada, mas houve um erro ao registrar a matrícula.');
      } else {
        Alert.alert('Sucesso!', 'Conta solicitada! Avise o Administrador de TI para aprovar o seu acesso.');
        setNomeNovo(''); setMatriculaNova(''); setEmailNovo(''); setSenhaNova('');
        setEcraAtual('login');
      }
    }
  };

  const fazerLogout = async () => {
    await supabase.auth.signOut();
    setUserId(null); setUsuarioMatricula(''); setUsuarioNome(''); setEmailLogin(''); setSenhaLogin(''); setIsAdmin(false);
    setEcraAtual('login');
  };

  const submeterCodigoManual = () => { if (codigoManual.trim() === '') return; setModalManualVisivel(false); lidarComCodigoLido({ type: 'manual', data: codigoManual.trim() }); setCodigoManual(''); };
  
  const lidarComCodigoLido = async ({ type, data }) => {
    setScanned(true); setCodigoLido(data);
    const { data: skuData, error } = await supabase.from('produtos_skus').select('*').or(`codigo_barras.eq.${data},codigo_barras_fardo.eq.${data}`).maybeSingle();
    if (error) { Alert.alert('Erro na busca', error.message); return; }
    if (!skuData) {
      Alert.alert('Novo Produto', `O código ${data} não está cadastrado.\n\nDeseja cadastrar agora?`, [
        { text: 'Cancelar', onPress: () => { setEcraAtual('dashboard'); setScanned(false); }, style: 'cancel' },
        { text: 'Cadastrar', onPress: () => { 
            if(!acessos.cadastros) return Alert.alert("Sem Permissão", "Você não tem acesso a Cadastros.");
            setFormDescricao(''); setFormConteudo('1'); setFormBase(null); setFormUnidade(null); setFormCodigoUnidade(data); setFormCodigoFardo(''); setFormQtdPorFardo('1'); setIsFardoScanned(false); setEcraAtual('cadastroSku'); 
        }}
      ]);
    } else {
      const bipouFardo = (skuData.codigo_barras_fardo === data && data !== skuData.codigo_barras);
      setIsFardoScanned(bipouFardo); setDadosProduto(skuData);
      const avisoExtra = bipouFardo ? `\n📦 Atenção: Você bipou um FARDO (${skuData.qtd_por_fardo} unidades).` : '';
      Alert.alert('Produto Encontrado!', `${skuData.descricao_real}${avisoExtra}\n\nO que deseja fazer?`, [
        { text: 'Cancelar', onPress: () => { setEcraAtual('dashboard'); setScanned(false); }, style: 'cancel' },
        { text: '📥 ENTRADA', onPress: () => { setFormLote(''); setFormValidade(''); setFormQtdEntrada(''); setEcraAtual('entradaEstoque'); }},
        { text: '📤 SAÍDA', onPress: async () => {
            const { data: lotesData } = await supabase.from('lotes_validade').select('*').eq('id_sku_relacionado', skuData.id).gt('quantidade_atual', 0).order('data_validade');
            setLotesProduto(lotesData || []); setLoteSelecionado(lotesData && lotesData.length > 0 ? lotesData[0] : null); setQtdAcao(1); setEcraAtual('detalhes'); 
        }}
      ]);
    }
  };

  const salvarNovoProduto = async () => {
    if (!formBase || !formDescricao || !formConteudo || !formUnidade || !formCodigoUnidade) return Alert.alert('Atenção', 'Preencha todos os campos obrigatórios!');
    const novoSku = { id_base_relacionado: formBase.id, codigo_barras: formCodigoUnidade, codigo_barras_fardo: formCodigoFardo || null, qtd_por_fardo: parseInt(formQtdPorFardo) || 1, descricao_real: formDescricao, conteudo_liquido: parseFloat(formConteudo.replace(',', '.')), unidade_medida_real: formUnidade };
    const { data: skuCadastrado, error } = await supabase.from('produtos_skus').insert(novoSku).select().single();
    if (error) return Alert.alert('Erro', error.message);
    setDadosProduto(skuCadastrado); setIsFardoScanned(false);
    Alert.alert('Sucesso!', 'Produto cadastrado!\n\nDeseja registrar a ENTRADA agora?', [{ text: 'Não', onPress: () => setEcraAtual('dashboard'), style: 'cancel' }, { text: 'Sim', onPress: () => { setFormLote(''); setFormValidade(''); setFormQtdEntrada(''); setEcraAtual('entradaEstoque'); }}]);
  };

  const confirmarEntrada = async () => {
    if (!formLote || !formValidade || !formQtdEntrada) return Alert.alert('Atenção', 'Preencha tudo.');
    const qtdDigitada = parseInt(formQtdEntrada);
    if (isNaN(qtdDigitada) || qtdDigitada <= 0) return Alert.alert('Atenção', 'Quantidade inválida.');
    const multiplicador = isFardoScanned ? (dadosProduto.qtd_por_fardo || 1) : 1;
    const qtdFinalEstoque = qtdDigitada * multiplicador;
    let dataIso = formValidade;
    if (formValidade.includes('/')) { const partes = formValidade.split('/'); if (partes.length === 3) dataIso = `${partes[2]}-${partes[1]}-${partes[0]}`; }
    if (dataIso.length !== 10) return Alert.alert('Atenção', 'Data inválida. Use DD/MM/AAAA.');
    const { data: loteExistente } = await supabase.from('lotes_validade').select('*').eq('id_sku_relacionado', dadosProduto.id).eq('numero_lote', formLote).single();
    let idDoLote = null;
    if (loteExistente) {
      await supabase.from('lotes_validade').update({ quantidade_atual: loteExistente.quantidade_atual + qtdFinalEstoque }).eq('id', loteExistente.id);
      idDoLote = loteExistente.id;
    } else {
      const { data: loteNovo, error: errLote } = await supabase.from('lotes_validade').insert({ id_sku_relacionado: dadosProduto.id, numero_lote: formLote, data_validade: dataIso, quantidade_atual: qtdFinalEstoque }).select().single();
      if (errLote) return Alert.alert('Erro', errLote.message);
      idDoLote = loteNovo.id;
    }
    await supabase.from('movimentacoes').insert({ id_lote_relacionado: idDoLote, tipo_movimentacao: 'ENTRADA', responsavel: usuarioMatricula, quantidade_movimentada: qtdFinalEstoque });
    Alert.alert('Sucesso!', `${qtdFinalEstoque} embalagens adicionadas.`); setEcraAtual('dashboard');
  };

  const confirmarSaida = async () => {
    if (qtdAcao <= 0 || !loteSelecionado) return;
    const multiplicador = isFardoScanned ? (dadosProduto.qtd_por_fardo || 1) : 1;
    const qtdFinalSaida = qtdAcao * multiplicador;
    if (qtdFinalSaida > loteSelecionado.quantidade_atual) return Alert.alert('Erro', `Estoque insuficiente!`);
    await supabase.from('lotes_validade').update({ quantidade_atual: loteSelecionado.quantidade_atual - qtdFinalSaida }).eq('id', loteSelecionado.id);
    await supabase.from('movimentacoes').insert({ id_lote_relacionado: loteSelecionado.id, tipo_movimentacao: 'SAÍDA', responsavel: usuarioMatricula, quantidade_movimentada: qtdFinalSaida });
    Alert.alert('Sucesso', `Saída registada!`); setEcraAtual('dashboard');
  };

  // Funções Auxiliares para Gestão de Usuários
  const alternarCargo = (id, cargoAtual) => {
    const cargos = ['PENDENTE', 'FUNCIONARIO', 'ADMIN'];
    const proximoCargo = cargos[(cargos.indexOf(cargoAtual) + 1) % cargos.length];
    setUsuariosAdmins(prev => prev.map(u => u.id === id ? { ...u, funcao: proximoCargo } : u));
  };
  
  const alternarPermissaoGestao = (id, campo, valor) => {
    setUsuariosAdmins(prev => prev.map(u => u.id === id ? { ...u, [campo]: valor } : u));
  };

  const salvarGestaoUsuario = async (user) => {
    const { error } = await supabase.from('perfis').update({
      funcao: user.funcao,
      acesso_dashboard: user.acesso_dashboard,
      acesso_cadastros: user.acesso_cadastros,
      acesso_movimentacoes: user.acesso_movimentacoes,
      acesso_ajustes: user.acesso_ajustes
    }).eq('id', user.id);
    if (error) Alert.alert('Erro ao Salvar', error.message);
    else Alert.alert('Sucesso!', `Acessos de ${user.nome_completo} atualizados.`);
  };

  if (!permissao) return <View />;
  if (!permissao.granted) return ( <View style={styles.container}><Text style={styles.textoCentro}>Precisamos da câmara para ler os códigos de barras.</Text><Button onPress={pedirPermissao} title="Permitir Acesso à Câmara" /></View> );

  // -------------------------------------------------------------
  // ECRÃ 0: LOGIN
  // -------------------------------------------------------------
  if (ecraAtual === 'login') {
    return (
      <View style={[styles.container, { justifyContent: 'center', padding: 20 }]}>
        <View style={{ backgroundColor: 'white', padding: 25, borderRadius: 15, elevation: 5 }}>
          <Text style={{ fontSize: 24, fontWeight: 'bold', textAlign: 'center', marginBottom: 10, color: '#1E293B' }}>📦 HMIM Mobile</Text>
          <Text style={{ textAlign: 'center', color: '#64748B', marginBottom: 30 }}>Acesse com seu e-mail corporativo ou pessoal.</Text>
          <Text style={styles.label}>E-mail</Text>
          <TextInput style={[styles.inputText, { marginBottom: 15 }]} placeholder="exemplo@email.com" value={emailLogin} onChangeText={setEmailLogin} autoCapitalize="none" keyboardType="email-address" />
          <Text style={styles.label}>Senha</Text>
          <TextInput style={[styles.inputText, { marginBottom: 30 }]} placeholder="***" secureTextEntry={true} value={senhaLogin} onChangeText={setSenhaLogin} />
          <TouchableOpacity style={[styles.botaoAcao, { backgroundColor: '#3B82F6', marginBottom: 15 }]} onPress={fazerLogin}><Text style={styles.textoBotaoBranco}>ENTRAR</Text></TouchableOpacity>
          <TouchableOpacity onPress={() => setEcraAtual('cadastroUsuario')}><Text style={{ textAlign: 'center', color: '#3B82F6', fontWeight: 'bold', marginTop: 10 }}>Não tem conta? Cadastre-se</Text></TouchableOpacity>
        </View>
      </View>
    );
  }

  // -------------------------------------------------------------
  // ECRÃ: CADASTRO DE NOVO USUÁRIO
  // -------------------------------------------------------------
  if (ecraAtual === 'cadastroUsuario') {
    return (
      <View style={[styles.container, { justifyContent: 'center', padding: 20 }]}>
        <ScrollView style={{ backgroundColor: 'white', padding: 25, borderRadius: 15, elevation: 5 }}>
          <Text style={{ fontSize: 22, fontWeight: 'bold', textAlign: 'center', marginBottom: 20, color: '#1E293B' }}>Criar Nova Conta</Text>
          <Text style={styles.label}>Nome Completo</Text>
          <TextInput style={[styles.inputText, { marginBottom: 10 }]} value={nomeNovo} onChangeText={setNomeNovo} />
          <Text style={styles.label}>Matrícula</Text>
          <TextInput style={[styles.inputText, { marginBottom: 10 }]} value={matriculaNova} onChangeText={setMatriculaNova} />
          <Text style={styles.label}>E-mail Pessoal</Text>
          <TextInput style={[styles.inputText, { marginBottom: 10 }]} value={emailNovo} onChangeText={setEmailNovo} autoCapitalize="none" keyboardType="email-address" />
          <Text style={styles.label}>Criar uma Senha</Text>
          <TextInput style={[styles.inputText, { marginBottom: 30 }]} secureTextEntry={true} value={senhaNova} onChangeText={setSenhaNova} />
          <TouchableOpacity style={[styles.botaoAcao, { backgroundColor: '#10B981', marginBottom: 15 }]} onPress={criarConta}><Text style={styles.textoBotaoBranco}>CADASTRAR</Text></TouchableOpacity>
          <TouchableOpacity onPress={() => setEcraAtual('login')}><Text style={{ textAlign: 'center', color: '#64748B', fontWeight: 'bold', marginTop: 10 }}>Voltar ao Login</Text></TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  // -------------------------------------------------------------
  // ECRÃ: GESTÃO DE USUÁRIOS (ADMIN)
  // -------------------------------------------------------------
  if (ecraAtual === 'gestaoUsuarios') {
    return (
      <View style={styles.container}>
        <View style={[styles.cabecalho, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}>
          <Text style={styles.titulo}>👥 Gestão de Acessos</Text>
          <TouchableOpacity onPress={() => setEcraAtual('dashboard')} style={{ backgroundColor: '#334155', padding: 8, borderRadius: 5 }}>
            <Text style={{ color: 'white', fontSize: 12 }}>Voltar</Text>
          </TouchableOpacity>
        </View>
        <ScrollView style={{ padding: 15 }}>
          {usuariosAdmins.map((u) => {
            const corCargo = u.funcao === 'ADMIN' ? '#3B82F6' : u.funcao === 'PENDENTE' ? '#EF4444' : '#10B981';
            
            // --- NOVA LÓGICA DE BLOQUEIO ---
            const isMe = u.id === userId; // Verifica se é o próprio usuário

            return (
              <View key={u.id} style={styles.cartaoUsuario}>
                <Text style={styles.nomeUsuario}>{u.nome_completo} {isMe ? '(Você)' : ''}</Text>
                <Text style={styles.emailUsuario}>{u.email} (Matrícula: {u.matricula})</Text>
                <View style={styles.divisor} />
                
                <View style={styles.linhaGestao}>
                  <Text style={styles.labelGestao}>Cargo Atual:</Text>
                  <TouchableOpacity 
                    style={[styles.botaoRole, { backgroundColor: corCargo, opacity: isMe ? 0.5 : 1 }]} 
                    onPress={() => alternarCargo(u.id, u.funcao)}
                    disabled={isMe}
                  >
                    <Text style={styles.textoBotaoBranco}>{u.funcao}</Text>
                  </TouchableOpacity>
                </View>

                <Text style={[styles.labelGestao, { marginTop: 15, marginBottom: 10 }]}>Páginas Liberadas:</Text>
                
                <View style={styles.linhaSwitch}>
                  <Text style={styles.textoSwitch}>📊 Dashboard</Text>
                  <Switch value={u.acesso_dashboard} onValueChange={(v) => alternarPermissaoGestao(u.id, 'acesso_dashboard', v)} disabled={isMe} />
                </View>
                <View style={styles.linhaSwitch}>
                  <Text style={styles.textoSwitch}>📝 Cadastros</Text>
                  <Switch value={u.acesso_cadastros} onValueChange={(v) => alternarPermissaoGestao(u.id, 'acesso_cadastros', v)} disabled={isMe} />
                </View>
                <View style={styles.linhaSwitch}>
                  <Text style={styles.textoSwitch}>🔄 Movimentações</Text>
                  <Switch value={u.acesso_movimentacoes} onValueChange={(v) => alternarPermissaoGestao(u.id, 'acesso_movimentacoes', v)} disabled={isMe} />
                </View>
                <View style={styles.linhaSwitch}>
                  <Text style={styles.textoSwitch}>⚖️ Ajustes</Text>
                  <Switch value={u.acesso_ajustes} onValueChange={(v) => alternarPermissaoGestao(u.id, 'acesso_ajustes', v)} disabled={isMe} />
                </View>

                <TouchableOpacity 
                  style={[styles.botaoAcao, { backgroundColor: '#1E293B', marginTop: 15, padding: 12, opacity: isMe ? 0.5 : 1 }]} 
                  onPress={() => salvarGestaoUsuario(u)}
                  disabled={isMe}
                >
                  <Text style={styles.textoBotaoBranco}>💾 Salvar Permissões</Text>
                </TouchableOpacity>
              </View>
            );
          })}
        </ScrollView>
      </View>
    );
  }

  // -------------------------------------------------------------
  // ECRÃS DE FUNCIONAMENTO (Entrada, Saída, Dashboard, Scanner)
  // -------------------------------------------------------------
  if (ecraAtual === 'entradaEstoque') {
    const multiplicador = isFardoScanned ? (dadosProduto?.qtd_por_fardo || 1) : 1;
    const labelQuantidade = isFardoScanned ? `3. Qtd de FARDOS (x${multiplicador})` : `3. Quantidade de PACOTES`;
    return (
      <View style={styles.container}>
        <View style={styles.cabecalho}><Text style={styles.titulo}>📥 Registrar Entrada</Text></View>
        <ScrollView style={{ padding: 20 }}>
          <Text style={styles.nomeProdutoGrande}>{dadosProduto?.descricao_real}</Text>
          {isFardoScanned && <Text style={styles.badgeFardo}>Atenção: Lançando FARDOS fechados.</Text>}
          <Text style={styles.label}>1. Lote (Visível na caixa)</Text>
          <TextInput style={styles.inputText} value={formLote} onChangeText={setFormLote} />
          <Text style={styles.label}>2. Data de Validade</Text>
          <TextInput style={styles.inputText} placeholder="DD/MM/AAAA" keyboardType="numeric" value={formValidade} onChangeText={(text) => { let cleaned = text.replace(/\D/g, ""); if (cleaned.length > 2 && cleaned.length <= 4) cleaned = `${cleaned.slice(0, 2)}/${cleaned.slice(2)}`; else if (cleaned.length > 4) cleaned = `${cleaned.slice(0, 2)}/${cleaned.slice(2, 4)}/${cleaned.slice(4, 8)}`; setFormValidade(cleaned); }} maxLength={10} />
          <Text style={styles.label}>{labelQuantidade}</Text>
          <TextInput style={styles.inputText} keyboardType="numeric" value={formQtdEntrada} onChangeText={setFormQtdEntrada} />
          <TouchableOpacity style={[styles.botaoAcao, { backgroundColor: '#3B82F6', marginTop: 30 }]} onPress={confirmarEntrada}><Text style={styles.textoBotaoBranco}>💾 CONFIRMAR ENTRADA</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.botaoAcao, { backgroundColor: '#EF4444', marginTop: 15, marginBottom: 40 }]} onPress={() => setEcraAtual('dashboard')}><Text style={styles.textoBotaoBranco}>❌ CANCELAR</Text></TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  if (ecraAtual === 'cadastroSku') {
    return (
      <View style={styles.container}>
        <View style={styles.cabecalho}><Text style={styles.titulo}>📝 Novo Produto</Text></View>
        <ScrollView style={{ padding: 20 }}>
          <Text style={styles.label}>1. Produto Base (Edital)</Text>
          <TouchableOpacity style={styles.inputSelect} onPress={() => setModalBaseVisivel(true)}><Text style={formBase ? styles.textoSelectPreenchido : styles.textoSelectVazio}>{formBase ? formBase.nome_oficial : 'Toque para selecionar...'}</Text></TouchableOpacity>
          <Text style={styles.label}>2. Descrição (Real)</Text>
          <TextInput style={styles.inputText} value={formDescricao} onChangeText={setFormDescricao} />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}><Text style={styles.label}>3. Cód. Unidade</Text><TextInput style={styles.inputText} value={formCodigoUnidade} onChangeText={setFormCodigoUnidade} /></View>
            <View style={{ flex: 1 }}><Text style={styles.label}>4. Cód. Fardo</Text><TextInput style={styles.inputText} value={formCodigoFardo} onChangeText={setFormCodigoFardo} /></View>
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}><Text style={styles.label}>5. Qtd Fardo</Text><TextInput style={styles.inputText} value={formQtdPorFardo} onChangeText={setFormQtdPorFardo} keyboardType="numeric" /></View>
            <View style={{ flex: 1 }}><Text style={styles.label}>6. Peso/Vol</Text><TextInput style={styles.inputText} keyboardType="numeric" value={formConteudo} onChangeText={setFormConteudo} /></View>
            <View style={{ flex: 1 }}><Text style={styles.label}>7. Unid</Text><TouchableOpacity style={styles.inputSelect} onPress={() => setModalUnidVisivel(true)}><Text>{formUnidade || '...'}</Text></TouchableOpacity></View>
          </View>
          <TouchableOpacity style={[styles.botaoAcao, { backgroundColor: '#10B981', marginTop: 30 }]} onPress={salvarNovoProduto}><Text style={styles.textoBotaoBranco}>💾 SALVAR</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.botaoAcao, { backgroundColor: '#64748B', marginTop: 15, marginBottom: 40 }]} onPress={() => setEcraAtual('dashboard')}><Text style={styles.textoBotaoBranco}>❌ CANCELAR</Text></TouchableOpacity>
        </ScrollView>
        <Modal visible={modalBaseVisivel} transparent={true}><View style={styles.modalFundo}><View style={styles.modalConteudo}><FlatList data={produtosBaseDb} keyExtractor={i=>i.id.toString()} renderItem={({item}) => <TouchableOpacity style={styles.modalItem} onPress={() => { setFormBase(item); setModalBaseVisivel(false); }}><Text style={styles.modalTextoItem}>{item.nome_oficial}</Text></TouchableOpacity>} /><Button title="Fechar" onPress={() => setModalBaseVisivel(false)}/></View></View></Modal>
        <Modal visible={modalUnidVisivel} transparent={true}><View style={styles.modalFundo}><View style={styles.modalConteudo}><FlatList data={unidadesOpcoes} keyExtractor={i=>i} renderItem={({item}) => <TouchableOpacity style={styles.modalItem} onPress={() => { setFormUnidade(item); setModalUnidVisivel(false); }}><Text style={styles.modalTextoItem}>{item}</Text></TouchableOpacity>} /><Button title="Fechar" onPress={() => setModalUnidVisivel(false)}/></View></View></Modal>
      </View>
    );
  }

  if (ecraAtual === 'detalhes') {
    return (
      <View style={styles.container}>
        <View style={styles.cabecalho}><Text style={styles.titulo}>📦 Registrar Saída</Text></View>
        <ScrollView style={{ padding: 20 }}>
          <Text style={styles.nomeProdutoGrande}>{dadosProduto?.descricao_real}</Text>
          {isFardoScanned && <Text style={styles.badgeFardo}>Atenção: Retirando FARDOS inteiros.</Text>}
          <Text style={styles.textoPergunta}>1. Lote Físico:</Text>
          {lotesProduto.map((lote) => {
            const isSelected = loteSelecionado?.id === lote.id;
            return (
              <TouchableOpacity key={lote.id} style={[styles.cartaoLote, isSelected ? styles.cartaoLoteAtivo : {}]} onPress={() => setLoteSelecionado(lote)}>
                <Text style={isSelected ? styles.textoBrancoNegrito : styles.nomeProduto}>Lote: {lote.numero_lote}</Text>
                <Text style={isSelected ? styles.textoBranco : {}}>Saldo: {lote.quantidade_atual} un.</Text>
              </TouchableOpacity>
            );
          })}
          <Text style={styles.textoPergunta}>{isFardoScanned ? `2. Quantos FARDOS?` : `2. Quantas embalagens?`}</Text>
          <View style={styles.seletorQuantidade}>
            <TouchableOpacity style={styles.botaoQtd} onPress={() => setQtdAcao(Math.max(1, qtdAcao - 1))}><Text style={styles.textoBotaoQtd}>-</Text></TouchableOpacity>
            <Text style={styles.numeroQtd}>{qtdAcao}</Text>
            <TouchableOpacity style={styles.botaoQtd} onPress={() => setQtdAcao(qtdAcao + 1)}><Text style={styles.textoBotaoQtd}>+</Text></TouchableOpacity>
          </View>
          <TouchableOpacity style={[styles.botaoAcao, { backgroundColor: loteSelecionado ? '#10B981' : '#ccc', marginTop: 40 }]} onPress={confirmarSaida} disabled={!loteSelecionado}><Text style={styles.textoBotaoBranco}>✅ CONFIRMAR SAÍDA</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.botaoAcao, { backgroundColor: '#EF4444', marginTop: 15, marginBottom: 40 }]} onPress={() => setEcraAtual('dashboard')}><Text style={styles.textoBotaoBranco}>❌ CANCELAR</Text></TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  if (ecraAtual === 'scanner') {
    return (
      <View style={styles.container}>
        <CameraView style={styles.camera} facing="back" zoom={zoomCamera} barcodeScannerSettings={{ barcodeTypes: ["ean13", "ean8", "qr", "upc_a", "upc_e", "code128"] }} onBarcodeScanned={scanned ? undefined : lidarComCodigoLido}>
          <View style={styles.camadaSobreposicao}>
            <Text style={styles.textoBranco}>Alinhe apenas UM código na mira</Text>
            <View style={styles.mira} />
            <View style={styles.containerZoom}>
              <Text style={styles.textoZoom}>Zoom:</Text>
              <TouchableOpacity style={[styles.botaoZoom, zoomCamera === 0 && styles.botaoZoomAtivo]} onPress={() => setZoomCamera(0)}><Text style={styles.textoBotaoZoom}>1x</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.botaoZoom, zoomCamera === 0.3 && styles.botaoZoomAtivo]} onPress={() => setZoomCamera(0.3)}><Text style={styles.textoBotaoZoom}>2x</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.botaoZoom, zoomCamera === 0.6 && styles.botaoZoomAtivo]} onPress={() => setZoomCamera(0.6)}><Text style={styles.textoBotaoZoom}>3x</Text></TouchableOpacity>
            </View>
            <TouchableOpacity style={styles.botaoManual} onPress={() => setModalManualVisivel(true)}><Text style={styles.textoBotaoBranco}>⌨️ Digitar Código Manualmente</Text></TouchableOpacity>
            <TouchableOpacity style={styles.botaoVoltar} onPress={() => { setEcraAtual('dashboard'); setScanned(false); }}><Text style={styles.textoBotaoBranco}>Voltar ao Início</Text></TouchableOpacity>
          </View>
        </CameraView>
        <Modal visible={modalManualVisivel} animationType="slide" transparent={true}>
          <View style={styles.modalFundo}>
            <View style={[styles.modalConteudo, { paddingBottom: 40 }]}>
              <Text style={styles.modalTitulo}>Digitar Código de Barras</Text>
              <TextInput style={[styles.inputText, { fontSize: 20, textAlign: 'center', letterSpacing: 2 }]} keyboardType="numeric" value={codigoManual} onChangeText={setCodigoManual} autoFocus={true} />
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
                <TouchableOpacity style={[styles.botaoAcao, { flex: 1, backgroundColor: '#EF4444', padding: 15 }]} onPress={() => setModalManualVisivel(false)}><Text style={styles.textoBotaoBranco}>Cancelar</Text></TouchableOpacity>
                <TouchableOpacity style={[styles.botaoAcao, { flex: 1, backgroundColor: '#10B981', padding: 15 }]} onPress={submeterCodigoManual}><Text style={styles.textoBotaoBranco}>Buscar</Text></TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.cabecalho, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}>
        <Text style={styles.titulo}>📦 HMIM Mobile</Text>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {isAdmin && (
            <TouchableOpacity onPress={() => setEcraAtual('gestaoUsuarios')} style={{ backgroundColor: '#10B981', padding: 8, borderRadius: 5 }}>
              <Text style={{ color: 'white', fontSize: 12, fontWeight: 'bold' }}>Gestão</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={fazerLogout} style={{ backgroundColor: '#334155', padding: 8, borderRadius: 5 }}>
            <Text style={{ color: 'white', fontSize: 12 }}>Sair</Text>
          </TouchableOpacity>
        </View>
      </View>
      <View style={{ backgroundColor: '#0F172A', paddingHorizontal: 20, paddingBottom: 15, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ color: '#94A3B8', fontSize: 14 }}>Operador: <Text style={{ color: 'white', fontWeight: 'bold' }}>{usuarioNome}</Text></Text>
      </View>
      
      {/* SE O USUÁRIO TEM ACESSO AO DASHBOARD, MOSTRA A LISTA */}
      {acessos.dashboard ? (
        <ScrollView style={styles.lista}>
          <Text style={styles.subtitulo}>Estoque Consolidado:</Text>
          {estoqueAgrupado.map((grupo, idx) => (
            <View key={idx} style={styles.cartaoGrupo}>
              <View style={styles.cabecalhoGrupo}>
                <Text style={styles.nomeGrupo}>{grupo.nome}</Text>
                <Text style={styles.saldoGrupo}>{formatarUnidade(grupo.totalReal, grupo.unidadeExibicao)}</Text>
              </View>
              {/* Previsão de Duração do Estoque */}
              <Text style={styles.textoPrevisao}>{grupo.textoPrevisao}</Text>
              
              <View style={styles.divisor} />
              {grupo.lotes.map((lote) => (
                <View key={lote.id} style={styles.linhaLote}>
                  <Text style={styles.textoSku}>{lote.produtos_skus.descricao_real} <Text style={styles.textoLoteBadge}>(Lote: {lote.numero_lote})</Text></Text>
                  <Text style={styles.textoQuantidadeLote}>
                    <Text style={styles.textoReal}>{formatarUnidade(lote.qtdRealCalculada, lote.produtos_skus.unidade_medida_real)}</Text> ({lote.pacotesFisicos} embalagens)
                  </Text>
                </View>
              ))}
            </View>
          ))}
          {estoqueAgrupado.length === 0 && <Text style={styles.textoCentro}>Nenhum produto em estoque.</Text>}
        </ScrollView>
      ) : (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 30 }}>
          <Text style={{ textAlign: 'center', fontSize: 18, color: '#64748B', marginBottom: 20 }}>Você não possui permissão para visualizar o relatório do Dashboard.</Text>
          {/* BOTÃO MÁGICO QUE ATUALIZA AS PERMISSÕES SEM PRECISAR DE LOGOUT */}
          <TouchableOpacity style={[styles.botaoAcao, { backgroundColor: '#10B981', width: '100%' }]} onPress={atualizarPermissoes}>
            <Text style={styles.textoBotaoBranco}>🔄 Atualizar Permissões</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* SE O USUÁRIO TEM ACESSO ÀS MOVIMENTAÇÕES, MOSTRA O BOTÃO DO SCANNER */}
      {acessos.movimentacoes && (
        <TouchableOpacity style={styles.botaoFlutuante} onPress={() => { setZoomCamera(0); setScanned(false); setEcraAtual('scanner'); }}>
          <Text style={styles.textoBotaoBranco}>📷 LER CÓDIGO</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  textoCentro: { textAlign: 'center', margin: 20, fontSize: 16 },
  cabecalho: { backgroundColor: '#1E293B', padding: 20, paddingTop: 50 },
  titulo: { color: 'white', fontSize: 22, fontWeight: 'bold' },
  lista: { padding: 15 },
  subtitulo: { fontSize: 18, fontWeight: 'bold', marginBottom: 10, color: '#333' },
  cartaoGrupo: { backgroundColor: 'white', padding: 15, borderRadius: 8, marginBottom: 15, elevation: 3, borderWidth: 1, borderColor: '#E2E8F0' },
  cabecalhoGrupo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  nomeGrupo: { fontSize: 18, fontWeight: 'bold', color: '#0F172A', flex: 1 },
  saldoGrupo: { fontSize: 18, fontWeight: 'bold', color: '#10B981', marginLeft: 10 },
  textoPrevisao: { fontSize: 13, color: '#64748B', fontStyle: 'italic', marginBottom: 10 },
  divisor: { height: 1, backgroundColor: '#E2E8F0', marginBottom: 10 },
  linhaLote: { backgroundColor: '#F8FAFC', padding: 10, borderRadius: 6, marginBottom: 8 },
  textoSku: { fontSize: 14, fontWeight: '600', color: '#334155' },
  textoLoteBadge: { fontSize: 13, color: '#64748B', fontWeight: 'normal' },
  textoQuantidadeLote: { fontSize: 14, color: '#475569', marginTop: 4 },
  textoReal: { fontWeight: 'bold', color: '#3B82F6' },
  cartaoLote: { backgroundColor: 'white', padding: 15, borderRadius: 8, marginBottom: 10, elevation: 2, borderWidth: 2, borderColor: 'transparent' },
  cartaoLoteAtivo: { backgroundColor: '#3B82F6', borderColor: '#2563EB' },
  textoBrancoNegrito: { color: 'white', fontWeight: 'bold', fontSize: 16 },
  textoBranco: { color: 'white', fontSize: 18, marginBottom: 20, fontWeight: 'bold' },
  nomeProduto: { fontSize: 16, fontWeight: 'bold', color: '#1E293B' },
  botaoFlutuante: { position: 'absolute', bottom: 30, alignSelf: 'center', backgroundColor: '#3B82F6', paddingVertical: 15, paddingHorizontal: 30, borderRadius: 30, elevation: 5 },
  camera: { flex: 1 },
  camadaSobreposicao: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
  mira: { width: 250, height: 100, borderWidth: 2, borderColor: '#10B981', backgroundColor: 'transparent', marginBottom: 20 },
  containerZoom: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)', padding: 10, borderRadius: 20, marginBottom: 30 },
  textoZoom: { color: 'white', marginRight: 10, fontWeight: 'bold' },
  botaoZoom: { paddingHorizontal: 15, paddingVertical: 8, borderRadius: 15, marginHorizontal: 5 },
  botaoZoomAtivo: { backgroundColor: '#10B981' },
  textoBotaoZoom: { color: 'white', fontWeight: 'bold' },
  botaoManual: { backgroundColor: '#334155', padding: 15, borderRadius: 10, borderWidth: 1, borderColor: '#475569', width: 250, alignItems: 'center' },
  botaoVoltar: { position: 'absolute', bottom: 40, backgroundColor: '#EF4444', padding: 15, borderRadius: 8 },
  textoBotaoBranco: { color: 'white', fontWeight: 'bold', fontSize: 16 },
  nomeProdutoGrande: { fontSize: 24, fontWeight: 'bold', color: '#1E293B' },
  badgeFardo: { backgroundColor: '#FEF08A', color: '#854D0E', padding: 8, borderRadius: 6, fontWeight: 'bold', marginVertical: 10, textAlign: 'center' },
  textoPergunta: { fontSize: 18, marginTop: 20, marginBottom: 10, fontWeight: '600' },
  seletorQuantidade: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 10 },
  botaoQtd: { backgroundColor: '#E2E8F0', width: 60, height: 60, borderRadius: 30, justifyContent: 'center', alignItems: 'center' },
  textoBotaoQtd: { fontSize: 30, fontWeight: 'bold', color: '#1E293B' },
  numeroQtd: { fontSize: 36, marginHorizontal: 40, fontWeight: 'bold', color: '#3B82F6' },
  botaoAcao: { padding: 18, borderRadius: 10, alignItems: 'center' },
  inputText: { backgroundColor: 'white', borderWidth: 1, borderColor: '#CBD5E1', padding: 12, borderRadius: 8, fontSize: 14 },
  label: { fontWeight: 'bold', color: '#475569', marginBottom: 5 },
  inputSelect: { backgroundColor: 'white', borderWidth: 1, borderColor: '#CBD5E1', padding: 12, borderRadius: 8, justifyContent: 'center' },
  textoSelectVazio: { color: '#94A3B8', fontSize: 14 },
  textoSelectPreenchido: { color: '#0F172A', fontSize: 14, fontWeight: 'bold' },
  modalFundo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalConteudo: { backgroundColor: 'white', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '80%' },
  modalTitulo: { fontSize: 20, fontWeight: 'bold', marginBottom: 15, textAlign: 'center' },
  modalItem: { paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  modalTextoItem: { fontSize: 16, color: '#1E293B' },
  cartaoUsuario: { backgroundColor: 'white', padding: 20, borderRadius: 10, marginBottom: 15, elevation: 2 },
  nomeUsuario: { fontSize: 18, fontWeight: 'bold', color: '#1E293B' },
  emailUsuario: { fontSize: 14, color: '#64748B', marginBottom: 10 },
  linhaGestao: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
  labelGestao: { fontSize: 16, fontWeight: 'bold', color: '#334155' },
  botaoRole: { paddingHorizontal: 15, paddingVertical: 8, borderRadius: 8 },
  linhaSwitch: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  textoSwitch: { fontSize: 15, color: '#475569' }
});