import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { translateField } from './fieldTranslations';

const colors = {
  identical: [232, 245, 233] as [number, number, number],     // Verde claro (#E8F5E9)
  different: [255, 235, 238] as [number, number, number],     // Vermelho claro (#FFEBEE)
  header: [33, 150, 243] as [number, number, number],         // Azul (#2196F3)
  text: [33, 33, 33] as [number, number, number],             // Cinza escuro (#212121)
  textLight: [117, 117, 117] as [number, number, number],     // Cinza claro (#757575)
};

const formatValue = (value: any): string => {
  if (value === null || value === undefined || value === '') return '-';
  if (typeof value === 'number') return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  
  // Detectar e formatar datas no formato SAP: /Date(timestamp)/
  if (typeof value === 'string' && value.startsWith('/Date(') && value.endsWith(')/')) {
    const timestamp = parseInt(value.substring(6, value.length - 2));
    const date = new Date(timestamp);
    return date.toLocaleDateString('pt-BR');
  }
  
  // Detectar e formatar datas no formato ISO: YYYY-MM-DDTHH:mm:ss.sssZ
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) {
    const date = new Date(value);
    return date.toLocaleDateString('pt-BR');
  }
  
  return String(value);
};

const formatDate = (date: string | Date): string => {
  const d = new Date(date);
  return d.toLocaleString('pt-BR', { 
    day: '2-digit', 
    month: '2-digit', 
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
};

export async function exportComparisonToPDF(
  comparisonData: any, 
  runId: string | null, 
  userEmail?: string,
  organizationName?: string,
  organizationLogo?: string,
  domainLogo?: string,
  spaiderLogo?: string,
  isFullFlow?: boolean,
  flowData?: any,
  testCharacteristics?: any
) {
  const doc = new jsPDF();
  
  // Configurar fonte padrão para evitar espaçamento indesejado
  doc.setFont('helvetica', 'normal');
  
  const pageWidth = doc.internal.pageSize.width;
  const pageHeight = doc.internal.pageSize.height;
  const margin = 20;
  let yPosition = margin;

  // Extrair dados com fallbacks para evitar erros
  // O comparison pode vir em diferentes formatos dependendo da fonte de dados
  const rawComparison = comparisonData.comparison || {};
  const rawDifferences = comparisonData.differences || rawComparison.differences || { header: [], items: [] };
  
  // Construir objeto comparison normalizado
  const comparison = {
    summary: comparisonData.summary || rawComparison.summary || { 
      totalDifferences: 0, 
      sectionsWithDifferences: [] 
    },
    differences: {
      header: rawDifferences.header || [],
      items: rawDifferences.items || []
    }
  };
  
  const original_order = comparisonData.original_order || { 
    id: 'N/A', 
    customer: 'N/A', 
    total: 'N/A', 
    items: comparison.differences.items?.length || 0, 
    date: new Date().toISOString() 
  };
  const new_order = comparisonData.new_order || { 
    id: 'N/A', 
    customer: 'N/A', 
    total: 'N/A', 
    items: comparison.differences.items?.length || 0, 
    date: new Date().toISOString() 
  };
  
  // Garantir que IDs existam
  const originalOrderId = original_order.id || comparisonData.orderId || 'N/A';
  const newOrderId = new_order.id || comparisonData.newOrderId || 'N/A';
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const fileName = `Comparacao_SAP_${originalOrderId}_vs_${newOrderId}_${timestamp}.pdf`;

  // Função para adicionar rodapé
  const addFooter = async (pageNum: number, totalPages: number) => {
    const footerY = pageHeight - 15;
    
    // Informações centrais (apenas texto, sem logos)
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...colors.textLight);
    doc.text(
      `Página ${pageNum} de ${totalPages} | Gerado em ${formatDate(new Date())}`,
      pageWidth / 2,
      footerY + 3,
      { align: 'center' }
    );
  };

  // Cabeçalho com DUAS logos lado a lado
  const headerLogoSize = 15; // Mesmo tamanho para ambas
  const logoYPosition = yPosition;

  // Logo do Spaider (canto superior esquerdo)
  if (spaiderLogo) {
    try {
      doc.addImage(spaiderLogo, 'PNG', margin, logoYPosition, headerLogoSize, headerLogoSize);
    } catch (error) {
      console.warn('Erro ao adicionar logo Spaider ao cabeçalho:', error);
    }
  }

  // Logo do Domínio (canto superior direito)
  if (domainLogo) {
    try {
      doc.addImage(domainLogo, 'PNG', pageWidth - margin - headerLogoSize, logoYPosition, headerLogoSize, headerLogoSize);
    } catch (error) {
      console.warn('Erro ao adicionar logo do domínio ao cabeçalho:', error);
    }
  }

  // Ajustar posição vertical após as logos
  yPosition += headerLogoSize + 6;

  // Títulos centralizados
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...colors.header);
  const mainTitle = isFullFlow ? 'RELATÓRIO DE FLUXO COMPLETO' : 'RELATÓRIO DE COMPARAÇÃO';
  doc.text(mainTitle, pageWidth / 2, yPosition, { align: 'center' });
  
  yPosition += 8;
  doc.setFontSize(16);
  const subtitle = isFullFlow ? 'Teste de Fluxo End-to-End SAP' : 'Replicação de Ordem SAP';
  doc.text(subtitle, pageWidth / 2, yPosition, { align: 'center' });
  
  yPosition += 6;
  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.text('Evidência de Teste Integrado', pageWidth / 2, yPosition, { align: 'center' });
  
  yPosition += 12;
  doc.setFontSize(10);
  doc.setTextColor(...colors.text);
  doc.text(`Data: ${formatDate(new Date())}`, margin, yPosition);
  yPosition += 6;
  doc.text(`Usuário: ${userEmail || 'Sistema'}`, margin, yPosition);
  yPosition += 6;
  
  // Formatar ID: substituir 'run_' por 'Teste_'
  const formattedId = runId ? runId.replace(/^run_/i, 'Teste_') : 'N/A';
  doc.text(`Teste ID: ${formattedId}`, margin, yPosition);
  
  yPosition += 12;

  // Resumo Executivo
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...colors.header);
  doc.text('RESUMO EXECUTIVO', margin, yPosition);
  yPosition += 8;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...colors.text);
  
  const totalDifferences = comparison.summary.totalDifferences || 0;
  const sectionsAffected = comparison.summary.sectionsWithDifferences?.join(', ') || 'Nenhuma';
  const status = totalDifferences === 0 ? 'Aprovado - Perfeito' : `Com Divergencias (${totalDifferences})`;
  
  doc.text(`Total de Diferenças: ${totalDifferences}`, margin, yPosition);
  yPosition += 6;
  doc.text(`Seções Afetadas: ${sectionsAffected}`, margin, yPosition);
  yPosition += 6;
  doc.text(`Status: ${status}`, margin, yPosition);
  yPosition += 6;
  
  // Adicionar características do teste
  const formatTestCharacteristics = (referenceOrder: any): string => {
    if (!referenceOrder) return 'Não especificado';
    
    const parts: string[] = [];
    if (referenceOrder.characteristic_1?.name) {
      parts.push(referenceOrder.characteristic_1.name);
    }
    if (referenceOrder.characteristic_2?.name) {
      parts.push(referenceOrder.characteristic_2.name);
    }
    if (referenceOrder.characteristic_3?.name) {
      parts.push(referenceOrder.characteristic_3.name);
    }
    
    return parts.length > 0 ? parts.join(' ') : 'Não especificado';
  };
  
  const testDescription = formatTestCharacteristics(testCharacteristics);
  doc.text(`Tipo de Teste: ${testDescription}`, margin, yPosition);
  yPosition += 10;

  // Tabela de Informações das Ordens
  autoTable(doc, {
    startY: yPosition,
    head: [['Campo', 'Ordem Original', 'Ordem Criada']],
    body: [
      ['ID da Ordem', formatValue(originalOrderId), formatValue(newOrderId)],
      ['Cliente', formatValue(original_order.customer), formatValue(new_order.customer)],
      ['Total', formatValue(original_order.total), formatValue(new_order.total)],
      ['Número de Itens', formatValue(original_order.items), formatValue(new_order.items)],
      ['Data', formatValue(original_order.date), formatValue(new_order.date)],
    ],
    styles: {
      fontSize: 9,
      cellPadding: 3,
      font: 'helvetica',
    },
    headStyles: {
      fillColor: colors.header,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      font: 'helvetica',
    },
    margin: { left: margin, right: margin },
  });

  yPosition = (doc as any).lastAutoTable.finalY + 12;

  // Comparação de Campos do Cabeçalho
  if (yPosition > pageHeight - 60) {
    doc.addPage();
    yPosition = margin;
  }

  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...colors.header);
  const orderSectionTitle = isFullFlow ? 'SEÇÃO 1: COMPARAÇÃO DE ORDEM' : 'CAMPOS DO CABECALHO';
  doc.text(orderSectionTitle, margin, yPosition);
  yPosition += 8;

  if (isFullFlow) {
    doc.setFontSize(14);
    doc.text('Campos do Cabeçalho:', margin, yPosition);
    yPosition += 6;
  }

  const headerTableData = comparison.differences.header.map((field: any) => [
    translateField(field.field),
    formatValue(field.originalValue),
    formatValue(field.newValue),
    field.isIdentical ? 'Igual' : 'Diferente'
  ]);

  autoTable(doc, {
    startY: yPosition,
    head: [['Campo', 'Valor Original', 'Valor Criado', 'Status']],
    body: headerTableData,
    styles: {
      fontSize: 9,
      cellPadding: 3,
      font: 'helvetica',
    },
    headStyles: {
      fillColor: colors.header,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      font: 'helvetica',
    },
    didParseCell: (data) => {
      if (data.row.index >= 0 && data.section === 'body') {
        const field = comparison.differences.header[data.row.index];
        if (field) {
          data.cell.styles.fillColor = field.isIdentical ? colors.identical : colors.different;
        }
      }
    },
    margin: { left: margin, right: margin },
  });

  yPosition = (doc as any).lastAutoTable.finalY + 12;

  // Comparação de Itens
  comparison.differences.items.forEach((item: any, itemIndex: number) => {
    if (yPosition > pageHeight - 80) {
      doc.addPage();
      yPosition = margin;
    }

    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...colors.header);
    
    // Buscar código e descrição do material dos campos
    const materialField = item.fields.find((f: any) => f.field === 'Material');
    const materialCode = materialField?.originalValue || materialField?.newValue || 'N/A';
    
    doc.text(`ITEM ${item.itemNumber} - Material: ${materialCode}`, margin, yPosition);
    yPosition += 8;

    // Campos do Item
    doc.setFontSize(11);
    doc.text('Campos do Item:', margin, yPosition);
    yPosition += 6;

    const itemFieldsData = item.fields.map((field: any) => [
      translateField(field.field),
      formatValue(field.originalValue),
      formatValue(field.newValue),
      field.isIdentical ? 'Igual' : 'Diferente'
    ]);

    autoTable(doc, {
      startY: yPosition,
      head: [['Campo', 'Valor Original', 'Valor Criado', 'Status']],
      body: itemFieldsData,
      styles: {
        fontSize: 8,
        cellPadding: 2,
        font: 'helvetica',
      },
      headStyles: {
        fillColor: colors.header,
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 8,
        font: 'helvetica',
      },
      didParseCell: (data) => {
        if (data.row.index >= 0 && data.section === 'body') {
          const field = item.fields[data.row.index];
          if (field) {
            data.cell.styles.fillColor = field.isIdentical ? colors.identical : colors.different;
          }
        }
      },
      margin: { left: margin, right: margin },
    });

    yPosition = (doc as any).lastAutoTable.finalY + 8;

    // Impostos do Item
    if (yPosition > pageHeight - 80) {
      doc.addPage();
      yPosition = margin;
    }

    doc.setFontSize(11);
    doc.text('Impostos do Item:', margin, yPosition);
    yPosition += 6;

    // Processar dados de impostos
    const taxesData: any[] = [];
    const taxTypes = ['ICMS', 'PIS', 'COFINS', 'ICMS_ST', 'CBS', 'IBS'];
    
    taxTypes.forEach(taxType => {
      const taxData = item.taxes[taxType];
      if (taxData) {
        // Linha de cabeçalho do imposto
        taxesData.push([
          { content: translateField(taxType), styles: { fontStyle: 'bold', fillColor: [240, 240, 240] } },
          { content: 'Taxa', styles: { fontStyle: 'bold', fillColor: [240, 240, 240] } },
          { content: 'Base', styles: { fontStyle: 'bold', fillColor: [240, 240, 240] } },
          { content: 'Valor Base', styles: { fontStyle: 'bold', fillColor: [240, 240, 240] } },
          { content: 'Valor Imposto', styles: { fontStyle: 'bold', fillColor: [240, 240, 240] } },
          { content: 'Status', styles: { fontStyle: 'bold', fillColor: [240, 240, 240] } }
        ]);
        
        // Linha Original
        taxesData.push([
          'Original',
          taxData.original.rate,
          taxData.original.base,
          taxData.original.baseValue,
          taxData.original.amount,
          taxData.differences.length === 0 ? 'Igual' : 'Diferente'
        ]);
        
        // Linha Nova
        taxesData.push([
          'Criado',
          taxData.new.rate,
          taxData.new.base,
          taxData.new.baseValue,
          taxData.new.amount,
          ''
        ]);
      }
    });

    autoTable(doc, {
      startY: yPosition,
      body: taxesData,
      styles: {
        fontSize: 7,
        cellPadding: 2,
        font: 'helvetica',
      },
      didParseCell: (data) => {
        if (data.row.index >= 0 && data.section === 'body') {
          // Pular linhas de cabeçalho de imposto (múltiplos de 3)
          if (data.row.index % 3 !== 0) {
            const taxIndex = Math.floor(data.row.index / 3);
            const taxType = taxTypes[taxIndex];
            const taxData = item.taxes[taxType];
            
            if (taxData) {
              data.cell.styles.fillColor = taxData.differences.length === 0 ? colors.identical : colors.different;
            }
          }
        }
      },
      margin: { left: margin, right: margin },
    });

    yPosition = (doc as any).lastAutoTable.finalY + 12;
  });

  // Seções adicionais para Full-Flow
  if (isFullFlow && flowData) {
    // SEÇÃO 2: REMESSA (DELIVERY)
    if (flowData.delivery_status) {
      if (yPosition > pageHeight - 60) {
        doc.addPage();
        yPosition = margin;
      }

      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...colors.header);
      doc.text('SEÇÃO 2: REMESSA (DELIVERY)', margin, yPosition);
      yPosition += 10;

      const deliveryRows: any[] = [
        ['Status', flowData.delivery_status || '-'],
        ['ID da Remessa', flowData.delivery_id || '-'],
        ['Status Picking', flowData.picking_status || '-'],
        ['Status PGI', flowData.pgi_status || '-'],
      ];

      // Adicionar campos adicionais do delivery_data se existirem
      if (flowData.delivery_data) {
        if (flowData.delivery_data.DeliveryDocument) {
          deliveryRows.push(['Documento de Remessa', flowData.delivery_data.DeliveryDocument]);
        }
        if (flowData.delivery_data.ShipToParty) {
          deliveryRows.push(['Recebedor', flowData.delivery_data.ShipToParty]);
        }
        if (flowData.delivery_data.ActualDeliveryDate) {
          deliveryRows.push(['Data de Entrega', formatValue(flowData.delivery_data.ActualDeliveryDate)]);
        }
      }

      autoTable(doc, {
        startY: yPosition,
        head: [['Campo', 'Valor']],
        body: deliveryRows,
        styles: {
          fontSize: 9,
          cellPadding: 3,
          font: 'helvetica',
        },
        headStyles: {
          fillColor: colors.header,
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          font: 'helvetica',
        },
        margin: { left: margin, right: margin },
      });

      yPosition = (doc as any).lastAutoTable.finalY + 12;
    }

    // SEÇÃO 3: FATURAMENTO (BILLING)
    if (flowData.billing_status) {
      if (yPosition > pageHeight - 60) {
        doc.addPage();
        yPosition = margin;
      }

      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...colors.header);
      doc.text('SEÇÃO 3: FATURAMENTO (BILLING)', margin, yPosition);
      yPosition += 10;

      const billingRows: any[] = [
        ['Status', flowData.billing_status || '-'],
        ['ID da Fatura', flowData.billing_id || '-'],
      ];

      // Adicionar campos adicionais do billing_data se existirem
      if (flowData.billing_data) {
        if (flowData.billing_data.BillingDocument) {
          billingRows.push(['Documento de Faturamento', flowData.billing_data.BillingDocument]);
        }
        if (flowData.billing_data.BillingDocumentDate) {
          billingRows.push(['Data de Faturamento', formatValue(flowData.billing_data.BillingDocumentDate)]);
        }
        if (flowData.billing_data.TotalNetAmount) {
          billingRows.push(['Valor Total', formatValue(flowData.billing_data.TotalNetAmount)]);
        }
        if (flowData.billing_data.TransactionCurrency) {
          billingRows.push(['Moeda', flowData.billing_data.TransactionCurrency]);
        }
      }

      autoTable(doc, {
        startY: yPosition,
        head: [['Campo', 'Valor']],
        body: billingRows,
        styles: {
          fontSize: 9,
          cellPadding: 3,
          font: 'helvetica',
        },
        headStyles: {
          fillColor: colors.header,
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          font: 'helvetica',
        },
        margin: { left: margin, right: margin },
      });

      yPosition = (doc as any).lastAutoTable.finalY + 12;
    }

    // SEÇÃO 4: NOTA FISCAL (NF-e)
    if (flowData.nfe_status) {
      if (yPosition > pageHeight - 60) {
        doc.addPage();
        yPosition = margin;
      }

      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...colors.header);
      doc.text('SEÇÃO 4: NOTA FISCAL (NF-e)', margin, yPosition);
      yPosition += 10;

      const nfeRows: any[] = [
        ['Status', flowData.nfe_status || '-'],
        ['Número NF-e', flowData.nfe_number || '-'],
      ];

      // Adicionar campos adicionais do nfe_data se existirem
      if (flowData.nfe_data) {
        if (flowData.nfe_data.BRNFNumber) {
          nfeRows.push(['Número da Nota', flowData.nfe_data.BRNFNumber]);
        }
        if (flowData.nfe_data.BRNFAccessKey) {
          nfeRows.push(['Chave de Acesso', flowData.nfe_data.BRNFAccessKey]);
        }
        if (flowData.nfe_data.BRNFIssueDate) {
          nfeRows.push(['Data de Emissão', formatValue(flowData.nfe_data.BRNFIssueDate)]);
        }
        if (flowData.nfe_data.BRNFStatus) {
          nfeRows.push(['Status NF-e', flowData.nfe_data.BRNFStatus]);
        }
      }

      autoTable(doc, {
        startY: yPosition,
        head: [['Campo', 'Valor']],
        body: nfeRows,
        styles: {
          fontSize: 9,
          cellPadding: 3,
          font: 'helvetica',
        },
        headStyles: {
          fillColor: colors.header,
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          font: 'helvetica',
        },
        margin: { left: margin, right: margin },
      });

      yPosition = (doc as any).lastAutoTable.finalY + 12;
    }

    // SEÇÃO 5: COMPARAÇÃO DE NOTA FISCAL (NF-e)
    if (flowData.nfe_differences && flowData.nfe_differences > 0) {
      if (yPosition > pageHeight - 60) {
        doc.addPage();
        yPosition = margin;
      }

      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...colors.header);
      doc.text('SEÇÃO 5: COMPARAÇÃO DE NOTA FISCAL', margin, yPosition);
      yPosition += 10;

      doc.setFontSize(11);
      doc.setFont('helvetica', 'normal');
      doc.text(`Total de diferenças encontradas: ${flowData.nfe_differences}`, margin, yPosition);
      yPosition += 10;

      // Nota: A lista detalhada de diferenças seria carregada do banco se necessário
      doc.setFontSize(9);
      doc.setTextColor(...colors.textLight);
      doc.text('(Detalhes das comparações disponíveis no sistema)', margin, yPosition);
      yPosition += 15;
    }

    // RESUMO DO FLUXO
    if (yPosition > pageHeight - 60) {
      doc.addPage();
      yPosition = margin;
    }

    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...colors.header);
    doc.text('RESUMO DO FLUXO', margin, yPosition);
    yPosition += 10;

    const summaryRows: any[] = [
      ['Etapas Concluídas', `${flowData.completed_steps || 0} de ${flowData.total_steps || 6}`],
      ['Status Geral', flowData.test_status || '-'],
    ];

    if (flowData.errors && flowData.errors.length > 0) {
      summaryRows.push(['Erros Encontrados', flowData.errors.length.toString()]);
      flowData.errors.forEach((error: string, idx: number) => {
        summaryRows.push([`Erro ${idx + 1}`, error]);
      });
    }

    autoTable(doc, {
      startY: yPosition,
      head: [['Campo', 'Valor']],
      body: summaryRows,
      styles: {
        fontSize: 9,
        cellPadding: 3,
        font: 'helvetica',
      },
      headStyles: {
        fillColor: colors.header,
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        font: 'helvetica',
      },
      margin: { left: margin, right: margin },
    });
  }

  // Adicionar rodapés em todas as páginas
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    await addFooter(i, totalPages);
  }

  // Salvar o PDF
  doc.save(fileName);
}
