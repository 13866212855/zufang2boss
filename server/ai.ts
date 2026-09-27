export interface AgnesConfig {
  apiBaseUrl: string;
  apiKey: string;
  modelName: string;
}

export function maskApiKey(key: string): string {
  if (!key) return '';
  if (key.length <= 10) return '******';
  return `${key.slice(0, 7)}...${key.slice(-4)}`;
}

export async function testAgnesConnection(config: AgnesConfig): Promise<{
  success: boolean;
  message: string;
  latencyMs?: number;
  modelOutput?: string;
}> {
  const startTime = Date.now();
  const cleanBaseUrl = config.apiBaseUrl.replace(/\/+$/, '');
  const endpoint = `${cleanBaseUrl}/chat/completions`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const rawModel = config.modelName.trim();
    // Try provided model name first, or fallback to lowercase if case-mismatched
    const modelToUse = rawModel;

    let response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey.trim()}`
      },
      body: JSON.stringify({
        model: modelToUse,
        messages: [
          { role: 'system', content: 'You are a test agent. Respond with "CONNECTED_OK".' },
          { role: 'user', content: 'Connection check' }
        ],
        max_tokens: 20,
        temperature: 0.2
      }),
      signal: controller.signal
    });

    // If model_not_found, try lowercase variant (e.g. Agnes-2.5-flash -> agnes-2.5-flash)
    if (!response.ok && response.status === 503) {
      const lowerModel = rawModel.toLowerCase();
      if (lowerModel !== rawModel) {
        response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${config.apiKey.trim()}`
          },
          body: JSON.stringify({
            model: lowerModel,
            messages: [
              { role: 'system', content: 'You are a test agent. Respond with "CONNECTED_OK".' },
              { role: 'user', content: 'Connection check' }
            ],
            max_tokens: 20,
            temperature: 0.2
          }),
          signal: controller.signal
        });
      }
    }

    clearTimeout(timeoutId);
    const latencyMs = Date.now() - startTime;

    if (!response.ok) {
      const errText = await response.text();
      return {
        success: false,
        message: `API响应错误 (HTTP ${response.status}): ${errText.slice(0, 180)}`,
        latencyMs
      };
    }

    const data = (await response.json()) as any;
    const reply = data.choices?.[0]?.message?.content || 'OK';

    return {
      success: true,
      message: `连接成功！模型响应正常 (${latencyMs}ms)`,
      latencyMs,
      modelOutput: reply.trim()
    };
  } catch (err: any) {
    const latencyMs = Date.now() - startTime;
    return {
      success: false,
      message: err.name === 'AbortError' ? '请求超时 (15秒未响应)' : `网络或地址异常: ${err.message}`,
      latencyMs
    };
  }
}

export async function generateHouseConsultationReply(params: {
  config: AgnesConfig;
  houseInfo: any;
  history: { sender: string; content: string }[];
  userMessage: string;
}): Promise<string> {
  const { config, houseInfo, history, userMessage } = params;
  const cleanBaseUrl = config.apiBaseUrl.replace(/\/+$/, '');
  const endpoint = `${cleanBaseUrl}/chat/completions`;

  let amenitiesList = '';
  try {
    const parsed = typeof houseInfo.amenities === 'string' ? JSON.parse(houseInfo.amenities) : houseInfo.amenities;
    amenitiesList = Array.isArray(parsed) ? parsed.join('、') : '';
  } catch {
    amenitiesList = houseInfo.amenities || '';
  }

  const systemPrompt = `你是一位专业、热情、真诚的房东专属智能租房管家。目前房东暂时离线，你正在代为热情接待租客咨询。

【房源真实档案】
- 房屋名称：${houseInfo.title || '精装品质两居'}
- 房屋位置：${houseInfo.location || '滨江区核心地段'}
- 建筑面积：${houseInfo.area_sqm || 89.5} 平方米
- 户型格局：${houseInfo.layout || '2室1厅1卫1阳台'}
- 房屋朝向：${houseInfo.orientation || '南北通透'}
- 所在楼层：${houseInfo.floor || '高层视野开阔'}
- 地铁交通：${houseInfo.metro_info || '近地铁站步行即达'}
- 家电配套：${amenitiesList || '中央空调、恒温地暖、洗烘一体机、双门冰箱、燃气灶'}
- 房屋介绍：${houseInfo.description || '精装品质房源，采光充足'}
- 租金参考政策：${houseInfo.secret_rent_price || '押一付三，长租优惠，详情可直接向房东确认'}

【回复规则】
1. 必须严格基于上述房源真实档案回答，实事求是，禁止无中生有编造信息。
2. 若租客询问租金、看房或底价优惠，请礼貌告知参考信息，并温馨提示租客可点击页面底部的【询问租金】按钮留下手机号，房东上线后会第一时间主动电话联系。
3. 语气亲切得体、热情专业，语言言简意赅（适合手机聊天窗口阅读，尽量在50-150字以内）。
4. 若涉及无法确定的特殊要求（如转租、养多只大型烈性犬、墙面改造等），建议租客留下电话或微信，由房东亲自沟通商定。`;

  const messages: { role: string; content: string }[] = [
    { role: 'system', content: systemPrompt }
  ];

  // Add recent context (up to 6 messages)
  const recentHistory = history.slice(-6);
  for (const item of recentHistory) {
    messages.push({
      role: item.sender === 'user' ? 'user' : 'assistant',
      content: item.content
    });
  }

  messages.push({
    role: 'user',
    content: userMessage
  });

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);

    const rawModel = config.modelName.trim();
    let response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey.trim()}`
      },
      body: JSON.stringify({
        model: rawModel,
        messages,
        max_tokens: 300,
        temperature: 0.6
      }),
      signal: controller.signal
    });

    if (!response.ok && response.status === 503) {
      const lowerModel = rawModel.toLowerCase();
      if (lowerModel !== rawModel) {
        response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${config.apiKey.trim()}`
          },
          body: JSON.stringify({
            model: lowerModel,
            messages,
            max_tokens: 300,
            temperature: 0.6
          }),
          signal: controller.signal
        });
      }
    }

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errText = await response.text();
      console.error('Agnes API error:', response.status, errText);
      return '您好！消息已为您留存。房东目前暂时离线，您可以点击页面下方的【询问租金】留下手机号，房东会第一时间主动致电您详细解答并安排看房！';
    }

    const data = (await response.json()) as any;
    const reply = data.choices?.[0]?.message?.content?.trim();

    if (!reply) {
      return '您好！消息已同步给房东。您可以点击页面下方【询问租金】留下联系方式，房东将尽快与您联系！';
    }

    return reply;
  } catch (err) {
    console.error('Failed to call Agnes AI:', err);
    return '您好！房东目前不在电脑旁，您的咨询已记录。您可以点击底部的【询问租金】提交手机号，房东会尽快与您电话沟通并预约实地看房！';
  }
}

export async function optimizeHouseDescription(params: {
  config: AgnesConfig;
  houseDetails: {
    title?: string;
    location?: string;
    area_sqm?: number | string;
    layout?: string;
    orientation?: string;
    floor?: string;
    metro_info?: string;
    amenities?: string[] | string;
    currentDescription?: string;
    optimizationGoal?: string;
  };
}): Promise<string> {
  const { config, houseDetails } = params;
  const cleanBaseUrl = config.apiBaseUrl.replace(/\/+$/, '');
  const endpoint = `${cleanBaseUrl}/chat/completions`;

  let amenitiesText = '';
  if (Array.isArray(houseDetails.amenities)) {
    amenitiesText = houseDetails.amenities.join('、');
  } else if (typeof houseDetails.amenities === 'string') {
    try {
      const parsed = JSON.parse(houseDetails.amenities);
      amenitiesText = Array.isArray(parsed) ? parsed.join('、') : houseDetails.amenities;
    } catch {
      amenitiesText = houseDetails.amenities;
    }
  }

  const prompt = `你是一位精通精品住宅租赁推广的专业房产文案专家。请为房东的出租房源编写或优化一份极具吸引力、转化率高、排版赏心悦目的【房源详细介绍亮点】文案。

【当前房源基础档案】
- 房屋标题：${houseDetails.title || '品质精装公寓'}
- 户型格局：${houseDetails.layout || '精装两居'}
- 建筑面积：${houseDetails.area_sqm || ''} ㎡
- 房屋朝向：${houseDetails.orientation || '南'}
- 所在楼层：${houseDetails.floor || '高层'}
- 详细位置：${houseDetails.location || ''}
- 交通配套：${houseDetails.metro_info || '近地铁站'}
- 家电配置：${amenitiesText || '全套品质家电齐全'}

${houseDetails.currentDescription ? `【房东已有的原始描述/草稿】\n"${houseDetails.currentDescription}"\n` : ''}

【文案要求】
1. 风格：真诚、高端、温馨、专业，强调“房东直租无中介费”、“真实房源”、“即租即住”。
2. 排版：采用符合移动端微信/H5浏览的模块化排版（分段清晰、使用自然小标题，如【空间与采光】、【品牌家电生活】、【通勤与周边】、【看房提示】）。
3. 突出自然采光通透、空间舒适度、大品牌家电体验（地暖/中央空调/洗烘一体等）与便利交通。
4. 直接输出最终文案正文，严禁输出任何“好的”、“这是为您生成的文案”等开场废话或结束语。`;

  const rawModel = config.modelName.trim();
  const messages = [
    { role: 'system', content: '你是一位资深房产文案优化大师，只输出优化后的房源介绍纯文本，不包含任何客套或多余解释。' },
    { role: 'user', content: prompt }
  ];

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    let response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey.trim()}`
      },
      body: JSON.stringify({
        model: rawModel,
        messages,
        max_tokens: 1200,
        temperature: 0.7
      }),
      signal: controller.signal
    });

    if (!response.ok && response.status === 503) {
      const lowerModel = rawModel.toLowerCase();
      if (lowerModel !== rawModel) {
        response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${config.apiKey.trim()}`
          },
          body: JSON.stringify({
            model: lowerModel,
            messages,
            max_tokens: 1200,
            temperature: 0.7
          }),
          signal: controller.signal
        });
      }
    }

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`大模型服务响应异常 (HTTP ${response.status}): ${errText.slice(0, 100)}`);
    }

    const data = (await response.json()) as any;
    const output = data.choices?.[0]?.message?.content?.trim();
    if (!output) {
      throw new Error('模型未返回有效文案内容');
    }
    return output;
  } catch (err: any) {
    console.error('optimizeHouseDescription failed:', err);
    throw err;
  }
}

