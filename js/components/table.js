/**
 * Table - Sortable, filterable, paginated table component
 */
const Table = {
  create(config) {
    const {
      containerId,
      columns,
      data,
      pageSize = 15,
      onRowClick = null,
      actions = null,
      toolbar = ''
    } = config;

    let currentPage = 1;
    let sortCol = null;
    let sortDir = 'asc';
    let filteredData = [...data];

    function render() {
      // Sort
      if (sortCol !== null) {
        const col = columns[sortCol];
        filteredData.sort((a, b) => {
          let va = col.value ? col.value(a) : a[col.key];
          let vb = col.value ? col.value(b) : b[col.key];
          if (va == null) va = '';
          if (vb == null) vb = '';
          if (typeof va === 'string') va = va.toLowerCase();
          if (typeof vb === 'string') vb = vb.toLowerCase();
          if (va < vb) return sortDir === 'asc' ? -1 : 1;
          if (va > vb) return sortDir === 'asc' ? 1 : -1;
          return 0;
        });
      }

      const totalPages = Math.ceil(filteredData.length / pageSize);
      if (currentPage > totalPages) currentPage = totalPages || 1;
      const start = (currentPage - 1) * pageSize;
      const pageData = filteredData.slice(start, start + pageSize);

      const container = document.getElementById(containerId);
      if (!container) return;

      container.innerHTML = `
        <div class="table-container">
          ${toolbar ? `<div class="table-toolbar">${toolbar}</div>` : ''}
          <table class="data-table">
            <thead>
              <tr>
                ${columns.map((col, i) => `
                  <th class="${sortCol === i ? 'sorted' : ''}" data-col="${i}" ${col.sortable !== false ? 'data-sortable="true"' : ''}>
                    ${col.label}
                    ${col.sortable !== false ? `<span class="sort-icon"><i class="fas ${sortCol === i ? (sortDir === 'asc' ? 'fa-sort-up' : 'fa-sort-down') : 'fa-sort'}"></i></span>` : ''}
                  </th>
                `).join('')}
                ${actions ? '<th>Actions</th>' : ''}
              </tr>
            </thead>
            <tbody>
              ${pageData.length === 0 ? `
                <tr><td colspan="${columns.length + (actions ? 1 : 0)}" class="text-center text-muted" style="padding:24px;">Aucune donnée trouvée</td></tr>
              ` : pageData.map(row => `
                <tr ${onRowClick ? `data-id="${row.id}" style="cursor:pointer"` : ''}>
                  ${columns.map(col => `
                    <td class="${col.primary ? 'primary' : ''}">${col.render ? col.render(row) : (row[col.key] != null ? row[col.key] : '-')}</td>
                  `).join('')}
                  ${actions ? `<td>${actions(row)}</td>` : ''}
                </tr>
              `).join('')}
            </tbody>
          </table>
          ${totalPages > 1 ? `
            <div class="table-pagination">
              <span>${start + 1}-${Math.min(start + pageSize, filteredData.length)} sur ${filteredData.length}</span>
              <div class="pagination-controls">
                <button class="page-btn" data-page="prev" ${currentPage <= 1 ? 'disabled' : ''}><i class="fas fa-chevron-left"></i></button>
                ${Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                  let p;
                  if (totalPages <= 5) p = i + 1;
                  else if (currentPage <= 3) p = i + 1;
                  else if (currentPage >= totalPages - 2) p = totalPages - 4 + i;
                  else p = currentPage - 2 + i;
                  return `<button class="page-btn ${p === currentPage ? 'active' : ''}" data-page="${p}">${p}</button>`;
                }).join('')}
                <button class="page-btn" data-page="next" ${currentPage >= totalPages ? 'disabled' : ''}><i class="fas fa-chevron-right"></i></button>
              </div>
            </div>
          ` : `
            <div class="table-pagination">
              <span>${filteredData.length} résultat${filteredData.length > 1 ? 's' : ''}</span>
              <div></div>
            </div>
          `}
        </div>
      `;

      // Bind events
      container.querySelectorAll('th[data-sortable="true"]').forEach(th => {
        th.addEventListener('click', () => {
          const col = parseInt(th.dataset.col);
          if (sortCol === col) {
            sortDir = sortDir === 'asc' ? 'desc' : 'asc';
          } else {
            sortCol = col;
            sortDir = 'asc';
          }
          render();
        });
      });

      container.querySelectorAll('.page-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const p = btn.dataset.page;
          if (p === 'prev') currentPage--;
          else if (p === 'next') currentPage++;
          else currentPage = parseInt(p);
          render();
        });
      });

      if (onRowClick) {
        container.querySelectorAll('tbody tr[data-id]').forEach(tr => {
          tr.addEventListener('click', (e) => {
            if (e.target.closest('button') || e.target.closest('a')) return;
            onRowClick(tr.dataset.id);
          });
        });
      }
    }

    render();

    return {
      refresh(newData) {
        filteredData = [...newData];
        currentPage = 1;
        render();
      },
      filter(filterFn) {
        filteredData = data.filter(filterFn);
        currentPage = 1;
        render();
      }
    };
  }
};
