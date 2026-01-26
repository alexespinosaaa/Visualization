"""
================================================================================
INTERACTIVE DASHBOARD - COMPREHENSIVE FIXED VERSION V2.1
Hospital Resource Optimization Dashboard

CRITICAL FIXES V2.1:
- FIXED: Replaced deprecated 'titlefont' in Plotly layout with 'title=dict(font=...)'
- FIXED: Added io.StringIO wrapper for pd.read_json to silence FutureWarnings
- FIXED: Robust error handling for all edge cases
- Fixed sorting logic (properly handles empty data)
- Added data validation at every step
- Improved filter coherence (cascading filters)

Author: Group Members  
Date: November 30, 2025

USAGE:
    python interactive_dashboard_v2.py

REQUIREMENTS:
    pip install dash plotly pandas numpy

ACCESS:
    http://127.0.0.1:8050/
================================================================================
"""

import dash
from dash import dcc, html, Input, Output, State, callback_context
import plotly.graph_objects as go
import plotly.express as px
import pandas as pd
import numpy as np
from datetime import datetime
from io import StringIO  # Added to fix read_json warnings

# ============================================================================
# DATA LOADING & VALIDATION
# ============================================================================

print("="*80)
print("LOADING DATA FOR INTERACTIVE DASHBOARD")
print("="*80)

try:
    # NOTE: Ensure these paths match your local directory structure
    df_services = pd.read_csv('JBI100 Data (2025-2026)/Hospital Beds Management/services_weekly.csv')
    df_patients = pd.read_csv('JBI100 Data (2025-2026)/Hospital Beds Management/patients.csv')
    df_staff_schedule = pd.read_csv('JBI100 Data (2025-2026)/Hospital Beds Management/staff_schedule.csv')
    df_staff = pd.read_csv('JBI100 Data (2025-2026)/Hospital Beds Management/staff.csv')
    
    print(f"✓ Services: {len(df_services)} records")
    print(f"✓ Patients: {len(df_patients)} records")
    print(f"✓ Staff Schedule: {len(df_staff_schedule)} records")
    print(f"✓ Staff: {len(df_staff)} staff members")
    
    # Data validation
    assert len(df_services) > 0, "Services dataset is empty"
    assert 'week' in df_services.columns, "Missing 'week' column"
    assert 'event' in df_services.columns, "Missing 'event' column"
    assert 'service' in df_services.columns, "Missing 'service' column"
    
    print("✓ Data validation passed")
    
except Exception as e:
    print(f"❌ Error loading data: {e}")
    print("WARNING: Dashboard may fail if data files are missing.")

# ============================================================================
# CONFIGURATION
# ============================================================================

# Consistent color scheme with static visualizations
COLORS = {
    'donation': '#3498db',
    'flu': '#e74c3c',
    'none': '#95a5a6',
    'strike': '#f39c12'
}

SERVICE_COLORS = {
    'ICU': '#e74c3c',
    'surgery': '#3498db',
    'general_medicine': '#2ecc71',
    'emergency': '#f39c12'
}

# ============================================================================
# DASH APP SETUP
# ============================================================================

app = dash.Dash(__name__, suppress_callback_exceptions=True)
app.title = "Hospital Resource Dashboard"

# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

def create_empty_figure(title, message="No data matches current filters"):
    """Create standardized empty figure with message."""
    return {
        'data': [],
        'layout': {
            'title': title,
            'xaxis': {'visible': False},
            'yaxis': {'visible': False},
            'annotations': [{
                'text': message,
                'xref': 'paper',
                'yref': 'paper',
                'x': 0.5,
                'y': 0.5,
                'showarrow': False,
                'font': {'size': 18, 'color': '#95a5a6'},
                'align': 'center'
            }],
            'height': 450,
            'plot_bgcolor': '#f8f9fa',
            'paper_bgcolor': '#ffffff'
        }
    }

def validate_filtered_data(df, min_rows=1):
    """Validate filtered data has minimum required rows."""
    return df is not None and len(df) >= min_rows

# ============================================================================
# LAYOUT
# ============================================================================

app.layout = html.Div([
    # Header
    html.Div([
        html.H1("Hospital Resource Optimization Dashboard", 
                style={'textAlign': 'center', 'color': '#2c3e50', 'marginBottom': 5}),
        html.P("Interactive Analysis of Patient Refusals, Staff Performance & Event Impact",
               style={'textAlign': 'center', 'color': '#7f8c8d', 'fontSize': 14, 'marginBottom': 5}),
        html.Div([
            html.Span(f"Dataset: {len(df_services)} records | ", style={'color': '#7f8c8d', 'fontSize': 12}),
            html.Span(f"{df_services['service'].nunique()} services | ", style={'color': '#7f8c8d', 'fontSize': 12}),
            html.Span(f"Weeks {df_services['week'].min()}-{df_services['week'].max()}", 
                     style={'color': '#7f8c8d', 'fontSize': 12})
        ], style={'textAlign': 'center'})
    ], style={'padding': '20px', 'backgroundColor': '#ecf0f1', 'borderBottom': '3px solid #3498db'}),
    
    # Control Panel
    html.Div([
        html.H3("Filters & Controls", style={'color': '#2c3e50', 'marginBottom': 15}),
        
        html.Div([
            # Week Range Slider
            html.Div([
                html.Label("Week Range:", 
                          style={'fontWeight': 'bold', 'marginBottom': 5, 'display': 'block'}),
                dcc.RangeSlider(
                    id='week-range-slider',
                    min=int(df_services['week'].min()),
                    max=int(df_services['week'].max()),
                    value=[int(df_services['week'].min()), int(df_services['week'].max())],
                    marks={int(i): str(int(i)) for i in range(
                        int(df_services['week'].min()), 
                        int(df_services['week'].max())+1, 
                        max(1, (int(df_services['week'].max()) - int(df_services['week'].min())) // 10)
                    )},
                    tooltip={"placement": "bottom", "always_visible": True},
                    allowCross=False
                )
            ], style={'width': '28%', 'display': 'inline-block', 'padding': '10px', 'verticalAlign': 'top'}),
            
            # Event Filter
            html.Div([
                html.Label("Event Type:", 
                          style={'fontWeight': 'bold', 'marginBottom': 5, 'display': 'block'}),
                dcc.Dropdown(
                    id='event-filter',
                    options=[{'label': 'All Events', 'value': 'all'}] + 
                            [{'label': e.capitalize(), 'value': e} 
                             for e in sorted(df_services['event'].unique())],
                    value='all',
                    clearable=False,
                    style={'fontSize': 13}
                )
            ], style={'width': '18%', 'display': 'inline-block', 'padding': '10px', 'verticalAlign': 'top'}),
            
            # Service Filter
            html.Div([
                html.Label("Service Type:", 
                          style={'fontWeight': 'bold', 'marginBottom': 5, 'display': 'block'}),
                dcc.Dropdown(
                    id='service-filter',
                    options=[{'label': 'All Services', 'value': 'all'}] +
                            [{'label': s.replace('_', ' ').title(), 'value': s} 
                             for s in sorted(df_services['service'].unique())],
                    value='all',
                    clearable=False,
                    style={'fontSize': 13}
                )
            ], style={'width': '18%', 'display': 'inline-block', 'padding': '10px', 'verticalAlign': 'top'}),
            
            # Sort By
            html.Div([
                html.Label("Sort Timeline By:", 
                          style={'fontWeight': 'bold', 'marginBottom': 5, 'display': 'block'}),
                dcc.Dropdown(
                    id='sort-by',
                    options=[
                        {'label': 'Week (Chronological)', 'value': 'week'},
                        {'label': 'Refusals (Highest First)', 'value': 'patients_refused'},
                        {'label': 'Morale (Lowest First)', 'value': 'staff_morale'}
                    ],
                    value='week',
                    clearable=False,
                    style={'fontSize': 13}
                )
            ], style={'width': '18%', 'display': 'inline-block', 'padding': '10px', 'verticalAlign': 'top'}),
            
            # Reset Button
            html.Div([
                html.Label("\u00A0", style={'display': 'block', 'marginBottom': 5}),  # Spacer
                html.Button('Reset All Filters', 
                           id='reset-button', 
                           n_clicks=0,
                           style={
                               'backgroundColor': '#e74c3c',
                               'color': 'white',
                               'border': 'none',
                               'padding': '10px 20px',
                               'fontSize': 13,
                               'fontWeight': 'bold',
                               'borderRadius': '5px',
                               'cursor': 'pointer',
                               'width': '100%'
                           })
            ], style={'width': '13%', 'display': 'inline-block', 'padding': '10px', 'verticalAlign': 'top'})
        ]),
        
        # Active Filter Summary
        html.Div(id='filter-summary', 
                style={'marginTop': 15, 'padding': '10px', 'backgroundColor': '#f8f9fa', 
                       'borderRadius': '5px', 'fontSize': 13})
        
    ], style={'padding': '20px', 'backgroundColor': '#ffffff', 'boxShadow': '0 2px 4px rgba(0,0,0,0.1)',
              'margin': '20px', 'borderRadius': '8px'}),
    
    # Store for filtered data
    dcc.Store(id='filtered-data-store'),
    
    # Main Charts Grid
    html.Div([
        # Row 1: Timeline + Heatmap
        html.Div([
            html.Div([
                dcc.Loading(
                    id="loading-timeline",
                    type="circle",
                    children=[dcc.Graph(id='timeline-chart', config={'displayModeBar': True})]
                )
            ], style={'width': '58%', 'display': 'inline-block', 'padding': '10px', 'verticalAlign': 'top'}),
            
            html.Div([
                dcc.Loading(
                    id="loading-heatmap",
                    type="circle",
                    children=[dcc.Graph(id='heatmap-chart', config={'displayModeBar': True})]
                )
            ], style={'width': '40%', 'display': 'inline-block', 'padding': '10px', 'verticalAlign': 'top'})
        ]),
        
        # Row 2: Sunburst + Treemap
        html.Div([
            html.Div([
                dcc.Loading(
                    id="loading-sunburst",
                    type="circle",
                    children=[dcc.Graph(id='sunburst-chart', config={'displayModeBar': True})]
                )
            ], style={'width': '48%', 'display': 'inline-block', 'padding': '10px', 'verticalAlign': 'top'}),
            
            html.Div([
                dcc.Loading(
                    id="loading-treemap",
                    type="circle",
                    children=[dcc.Graph(id='treemap-chart', config={'displayModeBar': True})]
                )
            ], style={'width': '48%', 'display': 'inline-block', 'padding': '10px', 'verticalAlign': 'top'})
        ]),
        
        # Row 3: Statistics Cards
        html.Div([
            html.Div(id='stats-cards', style={'padding': '10px'})
        ])
        
    ], style={'padding': '20px'}),
    
    # Footer
    html.Div([
        html.P([
            html.Span(f"Last updated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')} | ", 
                     style={'color': '#95a5a6'}),
            html.Span("Tip: Click on legend items to hide/show data series", 
                     style={'color': '#7f8c8d', 'fontStyle': 'italic'})
        ], style={'textAlign': 'center', 'fontSize': 12, 'margin': 0})
    ], style={'padding': '20px', 'backgroundColor': '#ecf0f1', 'borderTop': '2px solid #bdc3c7'})
    
], style={'fontFamily': 'Arial, sans-serif', 'backgroundColor': '#f5f6fa', 'minHeight': '100vh'})

# ============================================================================
# CALLBACKS
# ============================================================================

@app.callback(
    [Output('week-range-slider', 'value'),
     Output('event-filter', 'value'),
     Output('service-filter', 'value'),
     Output('sort-by', 'value')],
    Input('reset-button', 'n_clicks'),
    prevent_initial_call=True
)
def reset_filters(n_clicks):
    """Reset all filters to default values."""
    return (
        [int(df_services['week'].min()), int(df_services['week'].max())],
        'all',
        'all',
        'week'
    )

@app.callback(
    [Output('filtered-data-store', 'data'),
     Output('filter-summary', 'children')],
    [Input('week-range-slider', 'value'),
     Input('event-filter', 'value'),
     Input('service-filter', 'value'),
     Input('sort-by', 'value')]
)
def filter_and_summarize_data(week_range, event_filter, service_filter, sort_by):
    """Filter data and create summary of active filters."""
    try:
        # Start with full dataset
        filtered = df_services.copy()
        filter_descriptions = []
        
        # Apply week filter
        if week_range:
            filtered = filtered[(filtered['week'] >= week_range[0]) & 
                               (filtered['week'] <= week_range[1])]
            if week_range[0] != df_services['week'].min() or week_range[1] != df_services['week'].max():
                filter_descriptions.append(f"Weeks {week_range[0]}-{week_range[1]}")
        
        # Apply event filter
        if event_filter and event_filter != 'all':
            filtered = filtered[filtered['event'] == event_filter]
            filter_descriptions.append(f"Event: {event_filter.capitalize()}")
        
        # Apply service filter
        if service_filter and service_filter != 'all':
            filtered = filtered[filtered['service'] == service_filter]
            filter_descriptions.append(f"Service: {service_filter.replace('_', ' ').title()}")
        
        # Create summary message
        if len(filter_descriptions) == 0:
            summary = html.Div([
                html.Strong("Active Filters: ", style={'color': '#2c3e50'}),
                html.Span("None (showing all data)", style={'color': '#27ae60'})
            ])
        else:
            summary = html.Div([
                html.Strong("Active Filters: ", style={'color': '#2c3e50'}),
                html.Span(" | ".join(filter_descriptions), style={'color': '#e74c3c'}),
                html.Span(f" | Showing {len(filtered)} of {len(df_services)} records", 
                         style={'color': '#7f8c8d', 'marginLeft': '10px'})
            ])
        
        # Return as JSON
        return filtered.to_json(date_format='iso', orient='split'), summary
        
    except Exception as e:
        print(f"Error in filter_and_summarize_data: {e}")
        return df_services.to_json(date_format='iso', orient='split'), html.Div(
            f"Error applying filters: {str(e)}", style={'color': '#e74c3c'})


@app.callback(
    Output('timeline-chart', 'figure'),
    [Input('filtered-data-store', 'data'),
     Input('sort-by', 'value')]
)
def update_timeline(filtered_json, sort_by):
    """Create temporal timeline chart with proper sorting."""
    try:
        # Use StringIO to avoid FutureWarning
        filtered = pd.read_json(StringIO(filtered_json), orient='split')
        
        if not validate_filtered_data(filtered):
            return create_empty_figure('Temporal Dynamics: Refusals & Morale Over Time')
        
        # Aggregate by week
        weekly = filtered.groupby('week').agg({
            'patients_refused': 'sum',
            'staff_morale': 'mean',
            'event': lambda x: x.mode()[0] if len(x) > 0 else 'none'
        }).reset_index()
        
        # Ensure week is integer for proper linear plotting
        weekly['week'] = weekly['week'].astype(int)
        
        # Apply sorting
        if sort_by == 'patients_refused':
            weekly = weekly.sort_values('patients_refused', ascending=False)
        elif sort_by == 'staff_morale':
            weekly = weekly.sort_values('staff_morale', ascending=True)
        else:  # Default to chronological
            weekly = weekly.sort_values('week')
        
        # --- FIX: DYNAMIC AXIS TYPE ---
        # If Chronological -> Linear Axis (Forces 1, 2, 3 order) + Show Lines
        # If Sorted by Value -> Category Axis (Respects high-low order) + Dots Only
        if sort_by == 'week':
            xaxis_type = 'linear'
            chart_mode = 'lines+markers'
        else:
            xaxis_type = 'category'
            chart_mode = 'markers'

        fig = go.Figure()
        
        # Add stacked bars
        for event in sorted(weekly['event'].unique()):
            event_data = weekly[weekly['event'] == event]
            fig.add_trace(go.Bar(
                x=event_data['week'],
                y=event_data['patients_refused'],
                name=event.capitalize(),
                marker_color=COLORS.get(event, '#95a5a6'),
                hovertemplate='<b>Week %{x}</b><br>' +
                             f'Event: {event.capitalize()}<br>' +
                             'Refusals: %{y}<br>' +
                             '<extra></extra>'
            ))
        
        # Add morale trend line/dots
        fig.add_trace(go.Scatter(
            x=weekly['week'],
            y=weekly['staff_morale'],
            name='Staff Morale',
            yaxis='y2',
            mode=chart_mode, 
            line=dict(color='#2c3e50', width=3, dash='dot'),
            marker=dict(size=8, color='#2c3e50', symbol='circle'),
            hovertemplate='<b>Week %{x}</b><br>' +
                         'Morale: %{y:.1f}<br>' +
                         '<extra></extra>'
        ))
        
        # Layout
        fig.update_layout(
            title=dict(
                text='Temporal Dynamics: Patient Refusals & Staff Morale',
                font=dict(size=16, color='#2c3e50')
            ),
            xaxis=dict(
                title=dict(text='Week Number', font=dict(size=12, color='#2c3e50')),
                showgrid=True,
                gridcolor='#ecf0f1',
                type=xaxis_type  # <--- THIS IS THE KEY FIX
            ),
            yaxis=dict(
                title=dict(text='Patient Refusals (Total)', font=dict(size=12, color='#2c3e50')),
                showgrid=True,
                gridcolor='#ecf0f1'
            ),
            yaxis2=dict(
                title=dict(text='Staff Morale (Average)', font=dict(size=12, color='#2c3e50')),
                overlaying='y',
                side='right',
                showgrid=False,
                range=[40, 100]
            ),
            barmode='stack',
            height=450,
            legend=dict(
                x=0.01, y=0.99,
                bgcolor='rgba(255,255,255,0.8)',
                bordercolor='#bdc3c7',
                borderwidth=1
            ),
            plot_bgcolor='#f8f9fa',
            paper_bgcolor='#ffffff',
            hovermode='x unified'
        )
        
        return fig
        
    except Exception as e:
        print(f"Error in update_timeline: {e}")
        return create_empty_figure('Timeline Chart Error', f"Error: {str(e)}")            
@app.callback(
    Output('heatmap-chart', 'figure'),
    Input('filtered-data-store', 'data')
)
def update_heatmap(filtered_json):
    """Create service performance heatmap."""
    try:
        # Use StringIO to avoid FutureWarning
        filtered = pd.read_json(StringIO(filtered_json), orient='split')
        
        if not validate_filtered_data(filtered):
            return create_empty_figure('Service Performance Heatmap')
        
        # Create pivot for heatmap
        heatmap_data = filtered.pivot_table(
            index='service',
            columns='event',
            values='patients_refused',
            aggfunc='mean',
            fill_value=0
        )
        
        # Check if we have valid data
        if heatmap_data.empty or heatmap_data.shape[0] == 0:
            return create_empty_figure('Service Performance Heatmap', 
                                      'Insufficient data for heatmap visualization')
        
        fig = go.Figure(data=go.Heatmap(
            z=heatmap_data.values,
            x=[col.capitalize() for col in heatmap_data.columns],
            y=[idx.replace('_', ' ').title() for idx in heatmap_data.index],
            colorscale='Reds',
            text=np.round(heatmap_data.values, 1),
            texttemplate='%{text}',
            textfont={"size": 11, "color": "white"},
            colorbar=dict(title="Avg<br>Refusals"),
            hovertemplate='<b>%{y}</b><br>' +
                         'Event: %{x}<br>' +
                         'Avg Refusals: %{z:.1f}<br>' +
                         '<extra></extra>'
        ))
        
        fig.update_layout(
            title=dict(
                text='Service Performance: Average Refusals by Event Type',
                font=dict(size=14, color='#2c3e50')
            ),
            xaxis_title='Event Type',
            yaxis_title='Service',
            height=450,
            plot_bgcolor='#f8f9fa',
            paper_bgcolor='#ffffff'
        )
        
        return fig
        
    except Exception as e:
        print(f"Error in update_heatmap: {e}")
        return create_empty_figure('Heatmap Chart Error', f"Error: {str(e)}")

@app.callback(
    Output('sunburst-chart', 'figure'),
    Input('filtered-data-store', 'data')
)

def update_sunburst(filtered_json):
    """Create hierarchical sunburst chart."""
    try:
        # Use StringIO to avoid FutureWarning
        filtered = pd.read_json(StringIO(filtered_json), orient='split')
        
        if not validate_filtered_data(filtered, min_rows=2):
            return create_empty_figure('Refusals Breakdown: Event → Service',
                                      'Need multiple records for hierarchical view')
        # Aggregate for sunburst
        sunburst_data = filtered.groupby(['event', 'service']).agg({
            'patients_refused': 'sum'
        }).reset_index()
        
        # --- FIX 1: FILTER OUT ZERO/TINY VALUES ---
        # This removes the "slivers" that have 0 refusals
        sunburst_data = sunburst_data[sunburst_data['patients_refused'] > 0]
        sunburst_data = sunburst_data[sunburst_data['event'] != 'none'] 
        # Add formatted labels
        sunburst_data['event_label'] = sunburst_data['event'].str.capitalize()
        sunburst_data['service_label'] = sunburst_data['service'].str.replace('_', ' ').str.title()
        
        if len(sunburst_data) == 0:
            return create_empty_figure('Refusals Breakdown: Event → Service',
                                      'Insufficient data for hierarchy visualization')
        
        fig = px.sunburst(
            sunburst_data,
            path=['event_label', 'service_label'],
            values='patients_refused',
            color='patients_refused',
            color_continuous_scale='Reds',
            title='Refusals Breakdown: Impact of Critical Events (Excluding Normal Weeks)'
            )
        
        # --- FIX 2: IMPROVE LAYOUT AND HIDE CROWDED TEXT ---
        fig.update_layout(
            height=450,
            plot_bgcolor='#f8f9fa',
            paper_bgcolor='#ffffff',
            # This is the magic command:
            # "minsize=10" means if the font has to be smaller than 10px to fit,
            # "mode='hide'" means don't show the text at all.
            uniformtext=dict(minsize=10, mode='hide')
        )
        
        fig.update_traces(
            # Make the hover info cleaner
            hovertemplate='<b>%{label}</b><br>' +
                         'Refusals: %{value}<br>' +
                         'Share: %{percentParent:.1%}<br>' +
                         '<extra></extra>',
            # Use radial text orientation for better fit in slices
            insidetextorientation='radial'
        )
        
        return fig
        
    except Exception as e:
        print(f"Error in update_sunburst: {e}")
        return create_empty_figure('Sunburst Chart Error', f"Error: {str(e)}")
@app.callback(
    Output('treemap-chart', 'figure'),
    Input('filtered-data-store', 'data')
)
def update_treemap(filtered_json):
    """Create treemap visualization."""
    try:
        # Use StringIO to avoid FutureWarning
        filtered = pd.read_json(StringIO(filtered_json), orient='split')
        
        if not validate_filtered_data(filtered, min_rows=2):
            return create_empty_figure('Service Performance Matrix',
                                      'Need multiple records for treemap visualization')
        
        # Aggregate for treemap
        treemap_data = filtered.groupby(['service', 'event']).agg({
            'patients_refused': 'sum',
            'staff_morale': 'mean'
        }).reset_index()
        
        # Add formatted labels
        treemap_data['service_label'] = treemap_data['service'].str.replace('_', ' ').str.title()
        treemap_data['event_label'] = treemap_data['event'].str.capitalize()
        
        if len(treemap_data) == 0:
            return create_empty_figure('Service Performance Matrix',
                                      'Insufficient data for treemap visualization')
        
        fig = px.treemap(
            treemap_data,
            path=['service_label', 'event_label'],
            values='patients_refused',
            color='staff_morale',
            color_continuous_scale='RdYlGn',
            title='Service Performance Matrix: Size = Refusals | Color = Staff Morale',
            range_color=[50, 85]
        )
        
        fig.update_layout(
            height=450,
            plot_bgcolor='#f8f9fa',
            paper_bgcolor='#ffffff'
        )
        
        fig.update_traces(
            hovertemplate='<b>%{label}</b><br>' +
                         'Refusals: %{value}<br>' +
                         'Morale: %{color:.1f}<br>' +
                         '<extra></extra>'
        )
        
        return fig
        
    except Exception as e:
        print(f"Error in update_treemap: {e}")
        return create_empty_figure('Treemap Chart Error', f"Error: {str(e)}")

@app.callback(
    Output('stats-cards', 'children'),
    Input('filtered-data-store', 'data')
)
def update_stats_cards(filtered_json):
    """Create summary statistics cards."""
    try:
        # Use StringIO to avoid FutureWarning
        filtered = pd.read_json(StringIO(filtered_json), orient='split')
        
        if not validate_filtered_data(filtered):
            return html.Div("No data available for statistics", 
                          style={'textAlign': 'center', 'color': '#95a5a6', 'padding': '20px'})
        
        # Calculate statistics
        total_refusals = filtered['patients_refused'].sum()
        avg_morale = filtered['staff_morale'].mean()
        weeks_covered = filtered['week'].nunique()
        services_affected = filtered['service'].nunique()
        
        cards = html.Div([
            # Card 1: Total Refusals
            html.Div([
                html.H3(f"{int(total_refusals):,}", 
                       style={'color': '#e74c3c', 'margin': '0', 'fontSize': 28}),
                html.P("Total Patient Refusals", 
                      style={'color': '#7f8c8d', 'margin': '5px 0', 'fontSize': 13})
            ], style={'width': '18%', 'display': 'inline-block', 'padding': '20px',
                     'backgroundColor': '#fff5f5', 'borderRadius': '8px', 'margin': '5px',
                     'border': '2px solid #e74c3c', 'textAlign': 'center'}),
            
            # Card 2: Average Morale
            html.Div([
                html.H3(f"{avg_morale:.1f}", 
                       style={'color': '#f39c12', 'margin': '0', 'fontSize': 28}),
                html.P("Average Staff Morale", 
                      style={'color': '#7f8c8d', 'margin': '5px 0', 'fontSize': 13})
            ], style={'width': '18%', 'display': 'inline-block', 'padding': '20px',
                     'backgroundColor': '#fffaf0', 'borderRadius': '8px', 'margin': '5px',
                     'border': '2px solid #f39c12', 'textAlign': 'center'}),
            
            # Card 3: Weeks Covered
            html.Div([
                html.H3(f"{weeks_covered}", 
                       style={'color': '#3498db', 'margin': '0', 'fontSize': 28}),
                html.P("Weeks in Range", 
                      style={'color': '#7f8c8d', 'margin': '5px 0', 'fontSize': 13})
            ], style={'width': '18%', 'display': 'inline-block', 'padding': '20px',
                     'backgroundColor': '#f0f8ff', 'borderRadius': '8px', 'margin': '5px',
                     'border': '2px solid #3498db', 'textAlign': 'center'}),
            
            # Card 4: Services Affected
            html.Div([
                html.H3(f"{services_affected}", 
                       style={'color': '#9b59b6', 'margin': '0', 'fontSize': 28}),
                html.P("Services Affected", 
                      style={'color': '#7f8c8d', 'margin': '5px 0', 'fontSize': 13})
            ], style={'width': '18%', 'display': 'inline-block', 'padding': '20px',
                      'backgroundColor': '#f5f0ff', 'borderRadius': '8px', 'margin': '5px',
                      'border': '2px solid #9b59b6', 'textAlign': 'center'})
        ], style={'textAlign': 'center', 'marginTop': '20px'})
        
        return cards

    except Exception as e:
        print(f"Error in stats cards: {e}")
        return html.Div(f"Error loading stats: {e}", style={'color': 'red'})


# ============================================================================
# MAIN EXECUTION
# ============================================================================

if __name__ == '__main__':
    print("\n" + "="*80)
    print("HOSPITAL RESOURCE OPTIMIZATION DASHBOARD - STARTING")
    print("="*80)
    print("\n✅ Dashboard accessible at: http://127.0.0.1:8050/")
    print("   - Interactive filters and drill-down capabilities")
    print("   - Real-time data filtering and visualization")
    print("   - Press Ctrl+C to stop the server\n")
    print("="*80 + "\n")
    app.run(debug=True, host='127.0.0.1', port=8050)