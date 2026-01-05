import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { translateField } from "@/lib/fieldTranslations";

interface NFeComparison {
  id?: string;
  field: string;
  field_name?: string;
  field_path?: string;
  path?: string;
  original_value?: string | null;
  originalValue?: string | null;
  new_value?: string | null;
  newValue?: string | null;
  is_identical?: boolean;
  isIdentical?: boolean;
}

interface NFeComparisonTableProps {
  comparisons: NFeComparison[];
}

export function NFeComparisonTable({ comparisons }: NFeComparisonTableProps) {
  // Campos do cabeçalho que não devem ser exibidos como divergência
  const excludedHeaderFields = [
    'nfAuthenticationDate',
    'nfeDocumentStatus', 
    'nfeNumber',
    'notaFiscal'
  ];
  
  // Filtrar campos excluídos
  const filteredComparisons = comparisons.filter(comp => {
    const fieldName = comp.field_name || comp.field;
    return !excludedHeaderFields.includes(fieldName);
  });
  
  if (!filteredComparisons || filteredComparisons.length === 0) {
    return (
      <div className="text-sm text-muted-foreground p-4">
        Nenhuma comparação de NF-e disponível.
      </div>
    );
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[30%]">Campo</TableHead>
            <TableHead className="w-[30%]">NF-e Referência</TableHead>
            <TableHead className="w-[30%]">NF-e Criada</TableHead>
            <TableHead className="w-[10%] text-center">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filteredComparisons.map((comp, idx) => {
            const fieldName = comp.field_name || comp.field;
            const originalValue = comp.original_value || comp.originalValue;
            const newValue = comp.new_value || comp.newValue;
            const isIdentical = comp.is_identical ?? comp.isIdentical ?? true;
            
            return (
              <TableRow 
                key={comp.id || idx}
                className={!isIdentical ? 'bg-destructive/5' : ''}
              >
                <TableCell className="font-medium">
                  {translateField(fieldName)}
                </TableCell>
                <TableCell className="font-mono text-sm">
                  {originalValue || '-'}
                </TableCell>
                <TableCell className="font-mono text-sm">
                  {newValue || '-'}
                </TableCell>
                <TableCell className="text-center">
                  {isIdentical ? (
                    <Badge variant="default" className="text-xs">
                      Igual
                    </Badge>
                  ) : (
                    <Badge variant="destructive" className="text-xs">
                      Diferente
                    </Badge>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
