import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { translateField } from "@/lib/fieldTranslations";

// Função para formatar valores monetários em BRL
const formatCurrency = (value: string | null): string => {
  if (!value || value === '-') return '-';
  const numValue = parseFloat(value);
  if (isNaN(numValue)) return value;
  return numValue.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
};

interface TaxData {
  original: {
    rate: string | null;
    base: string | null;
    baseValue: string | null;
    amount: string | null;
  };
  new: {
    rate: string | null;
    base: string | null;
    baseValue: string | null;
    amount: string | null;
  };
  differences?: string[];
}

interface TaxComparisonTableProps {
  taxes: Record<string, TaxData>;
}

export function TaxComparisonTable({ taxes }: TaxComparisonTableProps) {
  const taxTypes = ['ICMS', 'PIS', 'COFINS', 'ICMS_ST', 'CBS', 'IBS'];

  return (
    <div className="space-y-4">
      {taxTypes.map((taxType) => {
        const taxData = taxes[taxType];
        
        // Se o imposto não existe, não renderizar
        if (!taxData) {
          return null;
        }

        const hasDifferences = taxData.differences && taxData.differences.length > 0;

        return (
          <Card 
            key={taxType} 
            className={`p-3 ${hasDifferences ? 'bg-destructive/5 border-destructive/20' : 'bg-muted/20'}`}
          >
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-2 font-bold" colSpan={6}>
                      <div className="flex items-center justify-between">
                        <span>{translateField(taxType)}</span>
                        {hasDifferences ? (
                          <Badge variant="destructive" className="text-xs">
                            {taxData.differences!.length} diferença(s)
                          </Badge>
                        ) : (
                          <Badge variant="default" className="text-xs">Igual</Badge>
                        )}
                      </div>
                    </th>
                  </tr>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left p-2 text-xs font-medium w-24"></th>
                    <th className="text-right p-2 text-xs font-medium">Taxa %</th>
                    <th className="text-right p-2 text-xs font-medium">Base %</th>
                    <th className="text-right p-2 text-xs font-medium">Valor Base</th>
                    <th className="text-right p-2 text-xs font-medium">Valor Imposto</th>
                    <th className="text-center p-2 text-xs font-medium w-20">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Linha Original */}
                  <tr className={`border-b ${hasDifferences ? 'bg-destructive/5' : ''}`}>
                    <td className="p-2 font-medium text-xs">Original</td>
                    <td className={`p-2 text-right text-xs ${hasDifferences ? 'text-destructive font-medium' : ''}`}>
                      {taxData.original.rate ?? '-'}
                    </td>
                    <td className={`p-2 text-right text-xs ${hasDifferences ? 'text-destructive font-medium' : ''}`}>
                      {taxData.original.base ?? '-'}
                    </td>
                    <td className={`p-2 text-right text-xs ${hasDifferences ? 'text-destructive font-medium' : ''}`}>
                      {formatCurrency(taxData.original.baseValue)}
                    </td>
                    <td className={`p-2 text-right text-xs ${hasDifferences ? 'text-destructive font-medium' : ''}`}>
                      {formatCurrency(taxData.original.amount)}
                    </td>
                    <td className="p-2 text-center text-xs">
                      {hasDifferences ? (
                        <span className="text-destructive">Diferente</span>
                      ) : (
                        <span className="text-muted-foreground">Igual</span>
                      )}
                    </td>
                  </tr>
                  
                  {/* Linha Criado */}
                  <tr className={hasDifferences ? 'bg-success/5' : ''}>
                    <td className="p-2 font-medium text-xs">Criado</td>
                    <td className={`p-2 text-right text-xs ${hasDifferences ? 'text-success font-medium' : ''}`}>
                      {taxData.new.rate ?? '-'}
                    </td>
                    <td className={`p-2 text-right text-xs ${hasDifferences ? 'text-success font-medium' : ''}`}>
                      {taxData.new.base ?? '-'}
                    </td>
                    <td className={`p-2 text-right text-xs ${hasDifferences ? 'text-success font-medium' : ''}`}>
                      {formatCurrency(taxData.new.baseValue)}
                    </td>
                    <td className={`p-2 text-right text-xs ${hasDifferences ? 'text-success font-medium' : ''}`}>
                      {formatCurrency(taxData.new.amount)}
                    </td>
                    <td className="p-2 text-center text-xs">
                      <span className="text-muted-foreground">-</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
